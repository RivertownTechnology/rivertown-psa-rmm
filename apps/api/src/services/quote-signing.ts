/**
 * Quote & agreement (MSA) e-signature orchestration.
 *
 * A signature request row (document_signatures) doubles as the public signing
 * link: its opaque token is emailed to the customer, and the row accumulates
 * the legal record (signer name, IP, user agent, timestamps).
 */
import { randomBytes } from 'crypto';
import { eq, and, inArray } from 'drizzle-orm';
import {
  quotes, customers, tenants, documentSignatures, agreements, attachments,
} from '@rivertown/db';
import type { Database } from '@rivertown/db';
import {
  sendQuoteEmailWithTemplate, sendAgreementEmail, sendSignedAgreementCopy, buildQuotePdf,
} from './document-email.js';
import {
  renderTemplate, escapeHtml, getDefaultMsaTemplate, generateAgreementPdfHtml,
} from './template-renderer.js';
import type { QuoteSignatureBlock } from './template-renderer.js';
import { htmlToPdf } from './pdf-generator.js';
import { uploadFile } from './r2-storage.js';
import { logAudit } from '../common/audit.js';
import { notifyTenantStaff } from './notifications.js';

const API_BASE_URL = () => process.env.API_BASE_URL || 'https://rivertownapi-production.up.railway.app';

export type SignatureEntityType = 'quote' | 'msa';

export interface SignerInfo {
  signerName: string;
  signerEmail?: string;
  ip: string;
  forwardedFor?: string;
  userAgent?: string;
}

function formatSignedAt(date: Date): string {
  return date.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC');
}

export function signatureBlockFromRow(row: {
  signerName: string | null; ipAddress: string | null; signedAt: Date | null;
}): QuoteSignatureBlock {
  return {
    signerName: row.signerName ?? '',
    ipAddress: row.ipAddress ?? '',
    signedAt: row.signedAt ? formatSignedAt(row.signedAt) : '',
  };
}

/**
 * Revokes any live (pending/viewed) signature request for the entity and
 * issues a fresh token, so a resend always invalidates previously emailed links.
 */
export async function createSignatureRequest(
  db: Database, tenantId: string, entityType: SignatureEntityType, entityId: string,
  recipientEmail: string, expiresAt?: Date,
): Promise<{ token: string; id: string }> {
  await db.update(documentSignatures)
    .set({ status: 'revoked', updatedAt: new Date() })
    .where(and(
      eq(documentSignatures.tenantId, tenantId),
      eq(documentSignatures.entityType, entityType),
      eq(documentSignatures.entityId, entityId),
      inArray(documentSignatures.status, ['pending', 'viewed']),
    ));

  const token = randomBytes(24).toString('hex');
  const [row] = await db.insert(documentSignatures).values({
    tenantId, entityType, entityId, token,
    recipientEmail,
    status: 'pending',
    expiresAt: expiresAt ?? null,
  }).returning();

  return { token, id: row.id };
}

function quoteLinkExpiry(validUntil: string | null): Date {
  if (validUntil) {
    const end = new Date(`${validUntil}T23:59:59`);
    if (!Number.isNaN(end.getTime()) && end > new Date()) return end;
  }
  const fallback = new Date();
  fallback.setDate(fallback.getDate() + 90);
  return fallback;
}

/**
 * Creates a fresh signing link and sends (or resends) the quote email.
 * Throws on failure; quote status/timestamps are only updated after the email
 * is accepted by the provider.
 */
export async function sendQuoteForSignature(
  db: Database, tenantId: string, quoteId: string, to: string,
): Promise<void> {
  const [quote] = await db.select().from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))).limit(1);
  if (!quote) throw new Error('Quote not found');

  const { token } = await createSignatureRequest(
    db, tenantId, 'quote', quoteId, to, quoteLinkExpiry(quote.validUntil),
  );
  const approveUrl = `${API_BASE_URL()}/api/public/sign/quote/${token}`;

  await sendQuoteEmailWithTemplate(db, tenantId, quoteId, { to, approveUrl });

  const now = new Date();
  await db.update(quotes).set({
    ...(quote.status === 'draft' ? { status: 'sent' } : {}),
    ...(quote.sentAt ? {} : { sentAt: now }),
    lastSentAt: now,
    updatedAt: now,
  }).where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)));
}

/** Marks the signature row signed and the quote approved, in one transaction. */
export async function completeQuoteSignature(
  db: Database, tenantId: string, quoteId: string, signatureId: string, signer: SignerInfo,
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(documentSignatures).set({
      status: 'signed',
      signerName: signer.signerName,
      signerEmail: signer.signerEmail ?? null,
      ipAddress: signer.ip,
      forwardedFor: signer.forwardedFor ?? null,
      userAgent: signer.userAgent ?? null,
      signedAt: now,
      updatedAt: now,
    }).where(eq(documentSignatures.id, signatureId));

    await tx.update(quotes).set({
      status: 'approved',
      approvedAt: now,
      updatedAt: now,
    }).where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)));
  });

  await logAudit(db, {
    tenantId, actorType: 'public_signer', actorId: signatureId,
    action: 'quote.approved', entityType: 'quote', entityId: quoteId, ipAddress: signer.ip,
    changes: {
      signerName: { old: null, new: signer.signerName },
      signerEmail: { old: null, new: signer.signerEmail ?? null },
    },
  });
}

/** Marks the signature row + quote declined. */
export async function declineQuoteSignature(
  db: Database, tenantId: string, quoteId: string, signatureId: string,
  info: { reason?: string; ip: string; forwardedFor?: string; userAgent?: string },
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(documentSignatures).set({
      status: 'declined',
      declinedAt: now,
      declineReason: info.reason ?? null,
      ipAddress: info.ip,
      forwardedFor: info.forwardedFor ?? null,
      userAgent: info.userAgent ?? null,
      updatedAt: now,
    }).where(eq(documentSignatures.id, signatureId));

    await tx.update(quotes).set({
      status: 'rejected',
      declineReason: info.reason ?? null,
      updatedAt: now,
    }).where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)));
  });

  await logAudit(db, {
    tenantId, actorType: 'public_signer', actorId: signatureId,
    action: 'quote.rejected', entityType: 'quote', entityId: quoteId, ipAddress: info.ip,
  });
}

/** Uploads a signed PDF to R2 and records it on the generic attachments table. */
export async function storeSignedPdf(
  db: Database, tenantId: string, entityType: 'quote' | 'agreement', entityId: string,
  fileName: string, pdfBuffer: Buffer,
): Promise<void> {
  const storageKey = `${tenantId}/${entityType}s/${entityId}/${Date.now()}-${fileName}`;
  await uploadFile(db, tenantId, storageKey, pdfBuffer, 'application/pdf');
  await db.insert(attachments).values({
    tenantId,
    entityType,
    entityId,
    fileName,
    fileSize: pdfBuffer.length,
    mimeType: 'application/pdf',
    storageKey,
  });
}

async function getBusinessSettings(db: Database, tenantId: string): Promise<Record<string, string> & { tenantName: string }> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const s = (tenant?.settings ?? {}) as Record<string, string>;
  return { ...s, tenantName: tenant?.name ?? '' };
}

/**
 * Renders the tenant's MSA template with escaped merge values, snapshots it as
 * an agreements row, creates a signing link, and emails it via sales email.
 * Returns the agreement id.
 */
export async function createAndSendMsa(
  db: Database, tenantId: string, quote: { id: string; quoteNumber: number; customerId: string },
  recipientEmail: string,
): Promise<string> {
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, quote.customerId), eq(customers.tenantId, tenantId))).limit(1);
  if (!customer) throw new Error('Customer not found');

  const s = await getBusinessSettings(db, tenantId);
  const template = s.msaTemplateHtml || getDefaultMsaTemplate();
  const effectiveDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const contentHtml = renderTemplate(template, {
    customerName: escapeHtml(customer.name),
    businessName: escapeHtml(s.businessName || s.tenantName || ''),
    businessAddress: escapeHtml(s.businessAddress || ''),
    businessEmail: escapeHtml(s.businessEmail || ''),
    effectiveDate: escapeHtml(effectiveDate),
    quoteNumber: escapeHtml(`#${quote.quoteNumber}`),
  });

  const [agreement] = await db.insert(agreements).values({
    tenantId,
    customerId: quote.customerId,
    quoteId: quote.id,
    agreementType: 'msa',
    title: 'Master Service Agreement',
    contentHtml,
    status: 'sent',
    effectiveDate: new Date().toISOString().split('T')[0],
    sentAt: new Date(),
  }).returning();

  const { token } = await createSignatureRequest(db, tenantId, 'msa', agreement.id, recipientEmail);
  const signUrl = `${API_BASE_URL()}/api/public/sign/agreement/${token}`;

  await sendAgreementEmail(db, tenantId, agreement.id, { to: recipientEmail, signUrl });
  return agreement.id;
}

/** Re-sends an existing agreement with a fresh signing link. */
export async function resendAgreement(
  db: Database, tenantId: string, agreementId: string, to: string,
): Promise<void> {
  const { token } = await createSignatureRequest(db, tenantId, 'msa', agreementId, to);
  const signUrl = `${API_BASE_URL()}/api/public/sign/agreement/${token}`;
  await sendAgreementEmail(db, tenantId, agreementId, { to, signUrl });
  await db.update(agreements).set({ sentAt: new Date(), updatedAt: new Date() })
    .where(and(eq(agreements.id, agreementId), eq(agreements.tenantId, tenantId)));
}

/** Renders the signed (or unsigned) agreement PDF. */
export async function buildAgreementPdf(
  db: Database, tenantId: string, agreement: { title: string; contentHtml: string; customerId: string },
  signature?: QuoteSignatureBlock,
): Promise<Buffer> {
  const s = await getBusinessSettings(db, tenantId);
  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, agreement.customerId), eq(customers.tenantId, tenantId))).limit(1);
  const html = generateAgreementPdfHtml({
    title: agreement.title,
    contentHtml: agreement.contentHtml,
    businessName: s.businessName || s.tenantName || '',
    businessPhone: s.businessPhone || '',
    businessEmail: s.businessEmail || '',
    businessCity: s.businessCity || undefined,
    businessState: s.businessState || undefined,
    signature,
    docRef: `${agreement.title} — ${customer?.name ?? ''}`,
  });
  return htmlToPdf(html, { margin: { top: '0', right: '0', bottom: '0', left: '0' } });
}

/**
 * Marks the agreement signed and handles fulfilment: signed PDF stored to R2,
 * copy emailed to the customer, staff notified. PDF/email/notify failures are
 * best-effort — the signature itself is already committed.
 */
export async function completeMsaSignature(
  db: Database, tenantId: string,
  agreement: { id: string; title: string; contentHtml: string; customerId: string },
  signatureId: string, signer: SignerInfo, recipientEmail: string,
): Promise<void> {
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(documentSignatures).set({
      status: 'signed',
      signerName: signer.signerName,
      signerEmail: signer.signerEmail ?? null,
      ipAddress: signer.ip,
      forwardedFor: signer.forwardedFor ?? null,
      userAgent: signer.userAgent ?? null,
      signedAt: now,
      updatedAt: now,
    }).where(eq(documentSignatures.id, signatureId));

    await tx.update(agreements).set({
      status: 'signed',
      signedAt: now,
      updatedAt: now,
    }).where(and(eq(agreements.id, agreement.id), eq(agreements.tenantId, tenantId)));
  });

  await logAudit(db, {
    tenantId, actorType: 'public_signer', actorId: signatureId,
    action: 'agreement.signed', entityType: 'agreement', entityId: agreement.id, ipAddress: signer.ip,
    changes: { signerName: { old: null, new: signer.signerName } },
  });

  // Fulfilment is best-effort: each step logs its own failure without undoing
  // the committed signature.
  let pdfBuffer: Buffer | null = null;
  try {
    pdfBuffer = await buildAgreementPdf(db, tenantId, agreement, {
      signerName: signer.signerName,
      ipAddress: signer.ip,
      signedAt: formatSignedAt(now),
    });
  } catch (err) {
    console.error('[SIGNING] Signed agreement PDF generation failed:', err);
  }

  if (pdfBuffer) {
    try {
      await storeSignedPdf(db, tenantId, 'agreement', agreement.id, `${agreement.title.replace(/[^\w -]/g, '')}-Signed.pdf`, pdfBuffer);
    } catch (err) {
      console.error('[SIGNING] Storing signed agreement PDF failed:', err);
    }
    try {
      const copyTo = signer.signerEmail || recipientEmail;
      if (copyTo) await sendSignedAgreementCopy(db, tenantId, agreement.id, pdfBuffer, copyTo);
    } catch (err) {
      console.error('[SIGNING] Emailing signed agreement copy failed:', err);
    }
  }

  try {
    await notifyTenantStaff(db, {
      tenantId, type: 'agreement_signed',
      title: `${agreement.title} signed by ${signer.signerName}`,
      entityType: 'agreement', entityId: agreement.id,
    });
  } catch (err) {
    console.error('[SIGNING] Staff notification failed:', err);
  }
}

/** Post-approval fulfilment for a signed quote: PDF + MSA + staff notify. All best-effort. */
export async function fulfillQuoteApproval(
  db: Database, tenantId: string,
  quote: { id: string; quoteNumber: number; customerId: string },
  signatureRow: { id: string; recipientEmail: string; signerName: string | null; signerEmail: string | null; ipAddress: string | null; signedAt: Date | null },
): Promise<{ msaSent: boolean }> {
  try {
    const pdf = await buildQuotePdf(db, tenantId, quote.id, signatureBlockFromRow(signatureRow));
    await storeSignedPdf(db, tenantId, 'quote', quote.id, `Quote-${quote.quoteNumber}-Signed.pdf`, pdf);
  } catch (err) {
    console.error('[SIGNING] Signed quote PDF failed:', err);
  }

  let msaSent = false;
  try {
    const msaRecipient = signatureRow.signerEmail || signatureRow.recipientEmail;
    if (msaRecipient) {
      await createAndSendMsa(db, tenantId, quote, msaRecipient);
      msaSent = true;
    }
  } catch (err) {
    console.error('[SIGNING] Auto-send MSA failed:', err);
    try {
      await notifyTenantStaff(db, {
        tenantId, type: 'msa_send_failed',
        title: `Quote #${quote.quoteNumber} approved, but the MSA email failed to send`,
        body: err instanceof Error ? err.message : String(err),
        entityType: 'quote', entityId: quote.id,
      });
    } catch { /* best-effort */ }
  }

  try {
    await notifyTenantStaff(db, {
      tenantId, type: 'quote_approved',
      title: `Quote #${quote.quoteNumber} approved by ${signatureRow.signerName ?? 'customer'}`,
      body: msaSent ? 'MSA sent automatically for signature.' : undefined,
      entityType: 'quote', entityId: quote.id,
    });
  } catch (err) {
    console.error('[SIGNING] Staff notification failed:', err);
  }

  return { msaSent };
}
