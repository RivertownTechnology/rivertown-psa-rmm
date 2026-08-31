/**
 * Template-based email sending for invoices, quotes, and payment receipts.
 * Includes full customer/billing variables and HTML attachment generation.
 */
import { eq, and } from 'drizzle-orm';
import {
  invoices, invoiceLineItems, quotes, quoteLineItems, agreements,
  customers, contacts, tenants, emailTemplates, payments, integrationConfigs,
} from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { sendEmail, sendBillingEmail, sendSalesEmail } from './email.js';
import { renderTemplate, generateInvoiceHtml, generateQuoteHtml, getDefaultTemplates } from './template-renderer.js';
import type { QuoteSignatureBlock } from './template-renderer.js';
import { htmlToPdf } from './pdf-generator.js';

// --- Shared helpers ---

async function getBusinessVars(db: Database, tenantId: string): Promise<Record<string, string>> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const s = (tenant?.settings ?? {}) as Record<string, string>;
  const apiBaseUrl = process.env.API_BASE_URL || 'https://rivertownapi-production.up.railway.app';
  return {
    businessName: s.businessName || tenant?.name || '',
    // Fall back to the bundled logo served by the API so emails are always branded
    businessLogo: s.businessLogo || `${apiBaseUrl}/api/public/branding/logo.png`,
    businessAddress: s.businessAddress || '',
    businessCity: s.businessCity || '',
    businessState: s.businessState || '',
    businessZip: s.businessZip || '',
    businessPhone: s.businessPhone || '',
    businessEmail: s.businessEmail || '',
  };
}

function buildCustomerVars(customer: {
  name: string; billingEmail?: string | null; phone?: string | null;
  address?: string | null; city?: string | null; state?: string | null; zip?: string | null;
}, contact?: { firstName: string; lastName: string; email: string; phone?: string | null; jobTitle?: string | null } | null): Record<string, string> {
  const fullAddr = [customer.address, [customer.city, customer.state].filter(Boolean).join(', '), customer.zip].filter(Boolean).join(' ');
  const contactName = contact ? `${contact.firstName} ${contact.lastName}` : '';
  return {
    customerName: customer.name,
    customerCompany: customer.name,
    customerEmail: customer.billingEmail || '',
    customerPhone: customer.phone || '',
    customerAddress: customer.address || '',
    customerCity: customer.city || '',
    customerState: customer.state || '',
    customerZip: customer.zip || '',
    customerFullAddress: fullAddr,
    billToName: contactName || customer.name,
    billToCompany: customer.name,
    billToAddress: customer.address || '',
    billToCity: customer.city || '',
    billToState: customer.state || '',
    billToZip: customer.zip || '',
    billToFullAddress: fullAddr,
    contactName,
    contactEmail: contact?.email || customer.billingEmail || '',
    contactPhone: contact?.phone || '',
    contactJobTitle: contact?.jobTitle || '',
  };
}

async function getTemplate(db: Database, tenantId: string, templateType: string) {
  const [template] = await db.select().from(emailTemplates)
    .where(and(eq(emailTemplates.tenantId, tenantId), eq(emailTemplates.templateType, templateType), eq(emailTemplates.isActive, true)))
    .limit(1);
  return template;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** 'YYYY-MM-DD' → 'September 30, 2026' (noon avoids timezone day-shift). */
export function formatDateLong(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  const d = new Date(`${dateStr}T12:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// --- Invoice Email ---

export async function sendInvoiceEmailWithTemplate(
  db: Database, tenantId: string, invoiceId: string, jwtSign?: (payload: any, opts: any) => string,
): Promise<boolean> {
  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId))).limit(1);
  if (!invoice) return false;

  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))).limit(1);
  if (!customer?.billingEmail) return false;

  const lineItemRows = await db.select().from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.tenantId, tenantId)))
    .orderBy(invoiceLineItems.sortOrder);

  const lineItemsHtml = lineItemRows.length ? `<table style="width:100%;border-collapse:collapse">${lineItemRows.map(li =>
    `<tr><td style="padding:6px 0;border-bottom:1px solid #eee">${li.description}</td><td style="text-align:center;padding:6px;border-bottom:1px solid #eee">${li.quantity ?? '1'}</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #eee">$${formatCents(li.unitPriceCents)}</td><td style="text-align:right;padding:6px 0;border-bottom:1px solid #eee">$${formatCents(li.totalCents)}</td></tr>`
  ).join('')}</table>` : '';

  const bv = await getBusinessVars(db, tenantId);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const ts = (tenant?.settings ?? {}) as Record<string, string>;

  // Generate 30-day view token for the invoice link
  const apiBaseUrl = process.env.API_BASE_URL || 'https://rivertownapi-production.up.railway.app';
  let viewInvoiceUrl = '';
  let payInvoiceUrl = '';

  if (jwtSign) {
    const viewToken = jwtSign(
      { tid: tenantId, type: 'invoice_view', invoiceId },
      { expiresIn: '30d' },
    );
    viewInvoiceUrl = `${apiBaseUrl}/api/v1/invoices/${invoiceId}/view?token=${encodeURIComponent(viewToken)}`;
    payInvoiceUrl = `${apiBaseUrl}/api/v1/invoices/${invoiceId}/pay?token=${encodeURIComponent(viewToken)}`;
  }

  const balanceCents = invoice.totalCents - invoice.amountPaidCents - (invoice.creditsAppliedCents ?? 0);

  const vars: Record<string, string> = {
    ...bv,
    ...buildCustomerVars(customer),
    invoiceNumber: String(invoice.invoiceNumber),
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    totalFormatted: formatCents(invoice.totalCents),
    balanceFormatted: formatCents(balanceCents),
    amountFormatted: formatCents(invoice.totalCents),
    invoiceNotes: invoice.notes ?? '',
    invoicePaymentTerms: ts.invoicePaymentTerms || '',
    invoiceFooter: ts.invoiceFooter || '',
    lineItemsHtml,
    viewInvoiceUrl,
    payInvoiceUrl: balanceCents > 0 ? payInvoiceUrl : '',
    // Keep paymentUrl for backwards compat with custom templates
    paymentUrl: balanceCents > 0 ? payInvoiceUrl : '',
  };

  const template = await getTemplate(db, tenantId, 'invoice_sent');

  let subject: string, html: string;
  if (template) {
    subject = renderTemplate(template.subject, vars);
    html = renderTemplate(template.bodyHtml, vars);
  } else {
    subject = `Invoice #${invoice.invoiceNumber} — $${formatCents(invoice.totalCents)} due ${invoice.dueDate}`;
    html = `<p>Please find attached Invoice #${invoice.invoiceNumber} for $${formatCents(invoice.totalCents)}, due ${invoice.dueDate}.</p>`;
  }

  return sendBillingEmail(db, tenantId, { to: customer.billingEmail, subject, html });
}

// --- Quote Email ---

/** Fetches the from-address of the sales email channel (for display in the PDF). */
async function getSalesFromAddress(db: Database, tenantId: string): Promise<string> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'sales-email')))
    .limit(1);
  const creds = (config?.credentials ?? {}) as Record<string, unknown>;
  return (creds.fromAddress as string) || '';
}

/**
 * Renders the Broadsheet-style quote document HTML (used for the PDF
 * attachment, the public signing page, and the signed-copy PDF).
 */
export async function buildQuoteDocumentHtml(
  db: Database, tenantId: string, quoteId: string,
  signature?: QuoteSignatureBlock,
): Promise<string> {
  const [quote] = await db.select().from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))).limit(1);
  if (!quote) throw new Error('Quote not found');

  const [customer] = await db.select().from(customers).where(eq(customers.id, quote.customerId)).limit(1);
  if (!customer) throw new Error('Customer not found');

  const lineItemRows = await db.select().from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId)).orderBy(quoteLineItems.sortOrder);

  const bv = await getBusinessVars(db, tenantId);
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const ts = (tenant?.settings ?? {}) as Record<string, string>;

  return generateQuoteHtml({
    businessName: bv.businessName, businessAddress: bv.businessAddress, businessCity: bv.businessCity,
    businessState: bv.businessState, businessZip: bv.businessZip, businessPhone: bv.businessPhone,
    businessEmail: bv.businessEmail, businessLogo: bv.businessLogo,
    businessWebsite: ts.businessWebsite || '',
    salesEmail: await getSalesFromAddress(db, tenantId),
    customerName: customer.name, customerAddress: customer.address ?? undefined,
    customerCity: customer.city ?? undefined, customerState: customer.state ?? undefined,
    customerZip: customer.zip ?? undefined, customerEmail: customer.billingEmail ?? undefined,
    customerPhone: customer.phone ?? undefined,
    quoteNumber: quote.quoteNumber, title: quote.title, summary: quote.summary ?? '',
    validUntil: formatDateLong(quote.validUntil),
    issuedDate: (quote.sentAt ?? quote.createdAt)?.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
    lineItems: lineItemRows.map(li => ({
      description: li.description, itemType: li.itemType, quantity: li.quantity ?? '1',
      unitPrice: (li.unitPriceCents / 100).toFixed(2),
      total: ((li.unitPriceCents * parseFloat(li.quantity ?? '1')) / 100).toFixed(2),
    })),
    subtotal: (quote.subtotalCents / 100).toFixed(2), tax: (quote.taxCents / 100).toFixed(2),
    total: (quote.totalCents / 100).toFixed(2),
    style: ts.quoteStyle || 'modern', footer: ts.quoteFooter || '',
    signature,
  });
}

/** Full-bleed PDF of the quote document (optionally with signature certificate). */
export async function buildQuotePdf(
  db: Database, tenantId: string, quoteId: string,
  signature?: QuoteSignatureBlock,
): Promise<Buffer> {
  const html = await buildQuoteDocumentHtml(db, tenantId, quoteId, signature);
  return htmlToPdf(html, { margin: { top: '0', right: '0', bottom: '0', left: '0' } });
}

/**
 * Sends the quote email with PDF attachment and approval link via the sales
 * email channel. Throws on any failure (PDF generation or email rejection) —
 * callers surface the error to the UI instead of silently succeeding.
 */
export async function sendQuoteEmailWithTemplate(
  db: Database, tenantId: string, quoteId: string,
  opts: { to: string; approveUrl: string },
): Promise<void> {
  const [quote] = await db.select().from(quotes)
    .where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId))).limit(1);
  if (!quote) throw new Error('Quote not found');

  const [customer] = await db.select().from(customers).where(eq(customers.id, quote.customerId)).limit(1);
  if (!customer) throw new Error('Customer not found');

  let contact = null;
  if (quote.contactId) {
    const [c] = await db.select().from(contacts).where(eq(contacts.id, quote.contactId)).limit(1);
    contact = c ?? null;
  }

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ...buildCustomerVars(customer, contact),
    quoteNumber: String(quote.quoteNumber),
    quoteTitle: quote.title,
    quoteSummary: quote.summary ?? '',
    totalFormatted: formatCents(quote.totalCents),
    validUntil: formatDateLong(quote.validUntil),
    approveQuoteUrl: opts.approveUrl,
  };

  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const ts = (tenant?.settings ?? {}) as Record<string, string>;
  vars.quoteFooter = ts.quoteFooter || '';

  // Tenant-customized template first, else the branded built-in default.
  const template = await getTemplate(db, tenantId, 'quote_sent')
    ?? getDefaultTemplates().find(t => t.templateType === 'quote_sent')!;

  const subject = renderTemplate(template.subject, vars);
  let html = renderTemplate(template.bodyHtml, vars);
  // Older tenant templates predate the approval link — append a button so
  // the customer can always reach the signing page.
  if (opts.approveUrl && !template.bodyHtml.includes('approveQuoteUrl')) {
    html += `<div style="text-align:center;margin:28px 0"><a href="${opts.approveUrl}" style="display:inline-block;background:#16a34a;color:#ffffff;padding:14px 40px;border-radius:6px;text-decoration:none;font-weight:600;font-size:16px">Review &amp; Approve Quote</a></div>`;
  }

  // PDF attachment is required — a quote email without the document is worse
  // than a visible failure.
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildQuotePdf(db, tenantId, quoteId);
  } catch (err) {
    throw new Error(`Quote PDF generation failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const sent = await sendSalesEmail(db, tenantId, {
    to: opts.to, subject, html,
    attachments: [{ filename: `Quote-${quote.quoteNumber}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
  });
  if (!sent) throw new Error('Email provider rejected the message — check the Sales Email settings.');
}

// --- Agreement (MSA) Emails ---

export async function sendAgreementEmail(
  db: Database, tenantId: string, agreementId: string,
  opts: { to: string; signUrl: string },
): Promise<void> {
  const [agreement] = await db.select().from(agreements)
    .where(and(eq(agreements.id, agreementId), eq(agreements.tenantId, tenantId))).limit(1);
  if (!agreement) throw new Error('Agreement not found');

  const [customer] = await db.select().from(customers).where(eq(customers.id, agreement.customerId)).limit(1);
  if (!customer) throw new Error('Customer not found');

  let quoteNumber = '';
  if (agreement.quoteId) {
    const [quote] = await db.select().from(quotes).where(eq(quotes.id, agreement.quoteId)).limit(1);
    if (quote) quoteNumber = String(quote.quoteNumber);
  }
  const msaYear = (agreement.createdAt ?? new Date()).getFullYear();
  const msaNumber = quoteNumber
    ? `MSA-${msaYear}-${quoteNumber.padStart(3, '0')}`
    : `MSA-${msaYear}-${agreement.id.slice(0, 6).toUpperCase()}`;
  const effectiveDate = agreement.effectiveDate
    ? new Date(`${agreement.effectiveDate}T12:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : '';

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ...buildCustomerVars(customer),
    agreementTitle: agreement.title,
    quoteNumber,
    msaNumber,
    effectiveDate,
    signAgreementUrl: opts.signUrl,
  };

  // Tenant-customized template first, else the branded built-in default —
  // never a bare-text fallback.
  const template = await getTemplate(db, tenantId, 'msa_sent')
    ?? getDefaultTemplates().find(t => t.templateType === 'msa_sent')!;

  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.bodyHtml, vars);

  const sent = await sendSalesEmail(db, tenantId, { to: opts.to, subject, html });
  if (!sent) throw new Error('Email provider rejected the agreement email — check the Sales Email settings.');
}

export async function sendSignedAgreementCopy(
  db: Database, tenantId: string, agreementId: string, pdfBuffer: Buffer, to: string,
): Promise<void> {
  const [agreement] = await db.select().from(agreements)
    .where(and(eq(agreements.id, agreementId), eq(agreements.tenantId, tenantId))).limit(1);
  if (!agreement) throw new Error('Agreement not found');

  const [customer] = await db.select().from(customers).where(eq(customers.id, agreement.customerId)).limit(1);

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ...(customer ? buildCustomerVars(customer) : {}),
    agreementTitle: agreement.title,
  };

  const template = await getTemplate(db, tenantId, 'msa_signed')
    ?? getDefaultTemplates().find(t => t.templateType === 'msa_signed')!;

  const subject = renderTemplate(template.subject, vars);
  const html = renderTemplate(template.bodyHtml, vars);

  const sent = await sendSalesEmail(db, tenantId, {
    to, subject, html,
    attachments: [{ filename: `${agreement.title.replace(/[^\w -]/g, '')}-Signed.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
  });
  if (!sent) throw new Error('Email provider rejected the signed-copy email — check the Sales Email settings.');
}

// --- Payment Receipt Email ---

export async function sendPaymentReceiptEmail(
  db: Database, tenantId: string, invoiceId: string, paymentAmountCents: number,
  jwtSign?: (payload: any, opts: any) => string,
): Promise<boolean> {
  const [invoice] = await db.select().from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId))).limit(1);
  if (!invoice) return false;

  const [customer] = await db.select().from(customers)
    .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))).limit(1);
  if (!customer?.billingEmail) return false;

  // Generate 30-day view link
  const apiBaseUrl = process.env.API_BASE_URL || 'https://rivertownapi-production.up.railway.app';
  let viewInvoiceUrl = '';
  if (jwtSign) {
    const viewToken = jwtSign(
      { tid: tenantId, type: 'invoice_view', invoiceId },
      { expiresIn: '30d' },
    );
    viewInvoiceUrl = `${apiBaseUrl}/api/v1/invoices/${invoiceId}/view?token=${encodeURIComponent(viewToken)}`;
  }

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ...buildCustomerVars(customer),
    invoiceNumber: String(invoice.invoiceNumber),
    amountFormatted: formatCents(paymentAmountCents),
    totalFormatted: formatCents(invoice.totalCents),
    viewInvoiceUrl,
  };

  const template = await getTemplate(db, tenantId, 'invoice_paid');

  let subject: string, html: string;
  if (template) {
    subject = renderTemplate(template.subject, vars);
    html = renderTemplate(template.bodyHtml, vars);
  } else {
    subject = `Payment received — Invoice #${invoice.invoiceNumber}`;
    html = `<p>Thank you! Payment of $${formatCents(paymentAmountCents)} received for Invoice #${invoice.invoiceNumber}.</p>`;
  }

  return sendBillingEmail(db, tenantId, { to: customer.billingEmail, subject, html });
}
