import { sanitizeBody } from '../../common/sanitize.js';
import { FastifyInstance } from 'fastify';
import { eq, and, count, desc, sql, inArray } from 'drizzle-orm';
import {
  quotes,
  quoteLineItems,
  contracts,
  contractLineItems,
  customers,
  contacts,
  invoices,
  invoiceLineItems,
  tenants,
  tenantSequences,
  documentSignatures,
} from '@rivertown/db';
import { createQuoteSchema, updateQuoteSchema, paginationSchema, sendQuoteSchema, publicSignSchema, publicDeclineSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { recalcInvoiceTotals } from '../invoices/routes.js';
import { quoteLineDiscount } from './discount.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';
import { clientIp } from '../../common/client-ip.js';

async function getNextQuoteNumber(db: any, tenantId: string): Promise<number> {
  const [result] = await db
    .update(tenantSequences)
    .set({ currentValue: sql`(${tenantSequences.currentValue}::int + 1)::text` })
    .where(
      and(
        eq(tenantSequences.tenantId, tenantId),
        eq(tenantSequences.sequenceName, 'quote'),
      ),
    )
    .returning({ value: tenantSequences.currentValue });

  if (!result) {
    await db.insert(tenantSequences).values({
      tenantId,
      sequenceName: 'quote',
      currentValue: '1',
    });
    return 1;
  }

  return parseInt(result.value, 10);
}

async function getNextInvoiceNumber(db: any, tenantId: string): Promise<number> {
  const [result] = await db
    .update(tenantSequences)
    .set({ currentValue: sql`(${tenantSequences.currentValue}::int + 1)::text` })
    .where(
      and(
        eq(tenantSequences.tenantId, tenantId),
        eq(tenantSequences.sequenceName, 'invoice'),
      ),
    )
    .returning({ value: tenantSequences.currentValue });

  if (!result) {
    await db.insert(tenantSequences).values({
      tenantId,
      sequenceName: 'invoice',
      currentValue: '1',
    });
    return 1;
  }

  return parseInt(result.value, 10);
}

export async function quoteRoutes(fastify: FastifyInstance) {
  // List quotes
  fastify.get('/api/v1/quotes', { preHandler: [fastify.authenticate, requirePermission('quotes:read')] }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const params = request.query as Record<string, string>;
    const { offset, limit } = paginationToOffset(query);
    const conditions = [eq(quotes.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(quotes.customerId, params.customerId));
    if (params.status) conditions.push(eq(quotes.status, params.status));
    const where = and(...conditions);
    const [data, [{ total }]] = await Promise.all([
      fastify.db.select().from(quotes).where(where).limit(limit).offset(offset).orderBy(desc(quotes.createdAt)),
      fastify.db.select({ total: count() }).from(quotes).where(where),
    ]);
    return paginate(data, total, query);
  });

  // Get quote with line items
  fastify.get('/api/v1/quotes/:id', { preHandler: [fastify.authenticate, requirePermission('quotes:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [quote] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!quote) throw new NotFoundError('Quote', id);

    const lineItems = await fastify.db.select().from(quoteLineItems)
      .where(and(eq(quoteLineItems.quoteId, id), eq(quoteLineItems.tenantId, request.tenantId)))
      .orderBy(quoteLineItems.sortOrder, quoteLineItems.createdAt);

    return { ...quote, lineItems };
  });

  // Create quote
  fastify.post('/api/v1/quotes', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const body = createQuoteSchema.parse(request.body);

    // Validate customer belongs to this tenant
    const [cust] = await fastify.db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, body.customerId), eq(customers.tenantId, request.tenantId))).limit(1);
    if (!cust) throw new NotFoundError('Customer', body.customerId);

    const quoteNumber = await getNextQuoteNumber(fastify.db, request.tenantId);
    const [quote] = await fastify.db.insert(quotes).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      contactId: body.contactId ?? null,
      quoteNumber,
      status: 'draft',
      title: body.title,
      summary: body.summary ?? null,
      validUntil: body.validUntil ?? null,
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
    }).returning();
    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'quote.created', entityType: 'quote', entityId: quote.id, ipAddress: request.ip,
    });
    reply.code(201);
    return quote;
  });

  // Update quote
  fastify.patch('/api/v1/quotes/:id', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateQuoteSchema.parse(request.body);
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    const [updated] = await fastify.db.update(quotes).set({ ...sanitizeBody(body), updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).returning();
    return updated;
  });

  // Delete quote + line items
  fastify.delete('/api/v1/quotes/:id', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    await fastify.db.delete(quoteLineItems).where(eq(quoteLineItems.quoteId, id));
    await fastify.db.delete(quotes).where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId)));
    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'quote.deleted', entityType: 'quote', entityId: id, ipAddress: request.ip,
    });
    reply.code(204).send();
  });

  // List line items
  fastify.get('/api/v1/quotes/:id/line-items', { preHandler: [fastify.authenticate, requirePermission('quotes:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const items = await fastify.db.select().from(quoteLineItems)
      .where(and(eq(quoteLineItems.quoteId, id), eq(quoteLineItems.tenantId, request.tenantId)))
      .orderBy(quoteLineItems.sortOrder, quoteLineItems.createdAt);
    return items;
  });

  // Add line item
  fastify.post('/api/v1/quotes/:id/line-items', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { description: string; itemType: string; unitPriceCents: number; listUnitPriceCents?: number | null; unitCostCents?: number | null; catalogItemId?: string | null; quantity?: string; taxable?: boolean };
    const qty = parseFloat(body.quantity ?? '1');

    // Verify the parent quote belongs to this tenant before attaching a line item
    const [parentQuote] = await fastify.db.select({ id: quotes.id }).from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!parentQuote) throw new NotFoundError('Quote', id);

    const [item] = await fastify.db.insert(quoteLineItems).values({
      tenantId: request.tenantId,
      quoteId: id,
      description: body.description,
      itemType: body.itemType,
      unitPriceCents: body.unitPriceCents,
      listUnitPriceCents: normalizeListPrice(body.listUnitPriceCents, body.unitPriceCents),
      unitCostCents: body.unitCostCents ?? null,
      catalogItemId: body.catalogItemId ?? null,
      quantity: body.quantity ?? '1',
      taxable: body.taxable ?? true,
    }).returning();

    // Recalculate quote totals
    await recalcQuoteTotals(fastify.db, id, request.tenantId);

    reply.code(201);
    return item;
  });

  // Update line item (inline qty/price edits from the quote screen)
  fastify.patch('/api/v1/quotes/:id/line-items/:lineId', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request) => {
    const { id, lineId } = request.params as { id: string; lineId: string };
    const body = request.body as { description?: string; quantity?: string; unitPriceCents?: number; listUnitPriceCents?: number | null; unitCostCents?: number | null; taxable?: boolean };

    const [existing] = await fastify.db.select().from(quoteLineItems)
      .where(and(eq(quoteLineItems.id, lineId), eq(quoteLineItems.quoteId, id), eq(quoteLineItems.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Line item', lineId);

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.description !== undefined) update.description = body.description;
    if (body.quantity !== undefined) {
      const qty = parseFloat(body.quantity);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error('Quantity must be a positive number');
      update.quantity = body.quantity;
    }
    if (body.unitPriceCents !== undefined) {
      if (!Number.isInteger(body.unitPriceCents) || body.unitPriceCents < 0) throw new Error('Unit price must be a non-negative amount');
      update.unitPriceCents = body.unitPriceCents;
    }
    if (body.listUnitPriceCents !== undefined) {
      // Validate against the price this request is actually setting, not the
      // stale stored one — price and list price are often edited together.
      const effectivePrice = body.unitPriceCents ?? existing.unitPriceCents;
      update.listUnitPriceCents = normalizeListPrice(body.listUnitPriceCents, effectivePrice);
    } else if (body.unitPriceCents !== undefined && existing.listUnitPriceCents != null) {
      // Price raised to or above the old list price leaves a discount that is
      // zero or negative; drop it rather than render "you save -$5".
      update.listUnitPriceCents = normalizeListPrice(existing.listUnitPriceCents, body.unitPriceCents);
    }
    if (body.unitCostCents !== undefined) update.unitCostCents = body.unitCostCents;
    if (body.taxable !== undefined) update.taxable = body.taxable;

    const [item] = await fastify.db.update(quoteLineItems).set(update)
      .where(and(eq(quoteLineItems.id, lineId), eq(quoteLineItems.tenantId, request.tenantId))).returning();

    await recalcQuoteTotals(fastify.db, id, request.tenantId);
    return item;
  });

  // Remove line item
  fastify.delete('/api/v1/quotes/:id/line-items/:lineId', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const { id, lineId } = request.params as { id: string; lineId: string };
    await fastify.db.delete(quoteLineItems)
      .where(and(eq(quoteLineItems.id, lineId), eq(quoteLineItems.tenantId, request.tenantId)));

    await recalcQuoteTotals(fastify.db, id, request.tenantId);

    reply.code(204).send();
  });

  // Send (or resend) quote — awaits the email so failures surface to the UI
  fastify.post('/api/v1/quotes/:id/send', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { to } = sendQuoteSchema.parse(request.body);
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    if (!['draft', 'sent', 'viewed'].includes(existing.status)) {
      reply.code(409).send({ error: 'INVALID_STATUS', message: `Cannot send a quote with status "${existing.status}"` });
      return;
    }

    const isResend = existing.status !== 'draft';
    const { sendQuoteForSignature } = await import('../../services/quote-signing.js');
    try {
      await sendQuoteForSignature(fastify.db, request.tenantId, id, to);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Quote email failed';
      request.log.error({ err }, `[QUOTES] Send failed for quote ${id}`);
      reply.code(502).send({ error: 'SEND_FAILED', message });
      return;
    }

    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: isResend ? 'quote.resent' : 'quote.sent', entityType: 'quote', entityId: id, ipAddress: request.ip,
      changes: { recipient: { old: null, new: to } },
    });

    const [updated] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    return updated;
  });

  // Recipient candidates for the send dialog (quote contact → billing email)
  fastify.get('/api/v1/quotes/:id/recipients', { preHandler: [fastify.authenticate, requirePermission('quotes:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [quote] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!quote) throw new NotFoundError('Quote', id);

    let contactEmail: string | null = null;
    if (quote.contactId) {
      const [contact] = await fastify.db.select({ email: contacts.email }).from(contacts)
        .where(and(eq(contacts.id, quote.contactId), eq(contacts.tenantId, request.tenantId))).limit(1);
      contactEmail = contact?.email ?? null;
    }
    const [customer] = await fastify.db.select({ billingEmail: customers.billingEmail }).from(customers)
      .where(and(eq(customers.id, quote.customerId), eq(customers.tenantId, request.tenantId))).limit(1);

    return { contactEmail, billingEmail: customer?.billingEmail ?? null };
  });

  // Signed quote PDF (regenerated on demand; includes the signature
  // certificate when the quote was e-signed). Uses the short-lived preview
  // token so the browser can open it directly.
  fastify.get('/api/v1/quotes/:id/signed-pdf', {
    config: { public: true, rateLimit: { max: 30, timeWindow: '1 minute' } } as any,
  }, async (request, reply) => {
    const token = (request.query as Record<string, string>).token;
    const { id } = request.params as { id: string };
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }
    try {
      const payload = fastify.jwt.verify<{ tid: string; type: string; resource?: string }>(token);
      if (payload.type !== 'preview' || payload.resource !== `quote:${id}`) { reply.code(401).send({ error: 'Invalid token' }); return; }
      (request as any).tenantId = payload.tid;
    } catch { reply.code(401).send({ error: 'Invalid or expired token' }); return; }

    const [quote] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!quote) throw new NotFoundError('Quote', id);

    const [sig] = await fastify.db.select().from(documentSignatures)
      .where(and(
        eq(documentSignatures.tenantId, request.tenantId),
        eq(documentSignatures.entityType, 'quote'),
        eq(documentSignatures.entityId, id),
        eq(documentSignatures.status, 'signed'),
      )).orderBy(desc(documentSignatures.signedAt)).limit(1);

    const { buildQuotePdf } = await import('../../services/document-email.js');
    const { signatureBlockFromRow } = await import('../../services/quote-signing.js');
    const pdf = await buildQuotePdf(fastify.db, request.tenantId, id, sig ? signatureBlockFromRow(sig) : undefined);
    reply
      .type('application/pdf')
      .header('Content-Disposition', `inline; filename="Quote-${quote.quoteNumber}${sig ? '-Signed' : ''}.pdf"`)
      .send(pdf);
  });

  // Latest signature request for the quote (send history + signed metadata)
  fastify.get('/api/v1/quotes/:id/signature', { preHandler: [fastify.authenticate, requirePermission('quotes:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [sig] = await fastify.db.select().from(documentSignatures)
      .where(and(
        eq(documentSignatures.tenantId, request.tenantId),
        eq(documentSignatures.entityType, 'quote'),
        eq(documentSignatures.entityId, id),
      ))
      .orderBy(desc(documentSignatures.createdAt)).limit(1);
    return sig ?? null;
  });

  // Cancel/void the active (pending or viewed) signature request for a quote.
  // Revokes the outstanding public link and returns the quote to 'draft' so it
  // can be cleanly re-sent — the escape hatch for a request stuck "pending"
  // (e.g. the send email failed, or it went to the wrong address).
  fastify.post('/api/v1/quotes/:id/signature/void', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [quote] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!quote) throw new NotFoundError('Quote', id);

    const now = new Date();
    const result = await fastify.db.update(documentSignatures)
      .set({ status: 'revoked', updatedAt: now })
      .where(and(
        eq(documentSignatures.tenantId, request.tenantId),
        eq(documentSignatures.entityType, 'quote'),
        eq(documentSignatures.entityId, id),
        inArray(documentSignatures.status, ['pending', 'viewed']),
      )).returning({ id: documentSignatures.id });

    if (result.length === 0) {
      reply.code(409).send({ error: 'NO_ACTIVE_REQUEST', message: 'There is no pending signature request to cancel.' });
      return;
    }

    // Roll a sent/viewed quote back to draft so the staff can re-send cleanly.
    if (['sent', 'viewed'].includes(quote.status)) {
      await fastify.db.update(quotes).set({ status: 'draft', updatedAt: now })
        .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId)));
    }

    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'quote.signature_voided', entityType: 'quote', entityId: id, ipAddress: request.ip,
    });
    return { success: true };
  });

  // ── Public quote signing (no auth; opaque token) ─────────────────

  const publicRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } } as any;

  async function loadQuoteSignatureContext(db: any, token: string) {
    if (!token || token.length < 10) return null;
    const [sig] = await db.select().from(documentSignatures)
      .where(and(eq(documentSignatures.token, token), eq(documentSignatures.entityType, 'quote')))
      .limit(1);
    if (!sig) return null;
    const [quote] = await db.select().from(quotes)
      .where(and(eq(quotes.id, sig.entityId), eq(quotes.tenantId, sig.tenantId))).limit(1);
    if (!quote) return null;
    return { sig, quote };
  }

  fastify.get('/api/public/sign/quote/:token', { config: publicRateLimit }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const ctx = await loadQuoteSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const { sig, quote } = ctx;

    const { generateSignPage } = await import('../../services/template-renderer.js');
    const { buildQuoteDocumentHtml } = await import('../../services/document-email.js');

    const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, sig.tenantId)).limit(1);
    const businessName = ((tenant?.settings as Record<string, string>)?.businessName) || tenant?.name || 'Rivertown Technology';
    const year = new Date().getFullYear();
    const docLabel = `Quote Q-${year}-${String(quote.quoteNumber).padStart(3, '0')}`;

    let state: 'active' | 'signed' | 'declined' | 'expired' | 'revoked' = 'active';
    if (sig.status === 'revoked') state = 'revoked';
    else if (sig.status === 'declined' || quote.status === 'rejected') state = 'declined';
    else if (sig.status === 'signed' || ['approved', 'converted'].includes(quote.status)) state = 'signed';
    else if (sig.expiresAt && new Date(sig.expiresAt) < new Date()) state = 'expired';

    // First open flips quote to 'viewed' so staff can see engagement
    if (state === 'active' && sig.status === 'pending') {
      const now = new Date();
      await fastify.db.update(documentSignatures).set({ status: 'viewed', viewedAt: now, updatedAt: now })
        .where(eq(documentSignatures.id, sig.id));
      if (quote.status === 'sent') {
        await fastify.db.update(quotes).set({ status: 'viewed', viewedAt: now, updatedAt: now })
          .where(eq(quotes.id, quote.id));
      }
      await logAudit(fastify.db, {
        tenantId: sig.tenantId, actorType: 'public_signer', actorId: sig.id,
        action: 'quote.viewed', entityType: 'quote', entityId: quote.id, ipAddress: request.ip,
      });
    }

    let docHtml = '';
    if (state === 'active' || state === 'signed') {
      try {
        docHtml = await buildQuoteDocumentHtml(fastify.db, sig.tenantId, quote.id);
      } catch (err) {
        request.log.error({ err }, '[QUOTES] Sign page document render failed');
        docHtml = '<p style="padding:24px">The quote document could not be rendered. Please contact us.</p>';
      }
    }

    const base = `${process.env.API_BASE_URL || 'https://rivertownapi-production.up.railway.app'}/api/public/sign/quote/${token}`;
    const html = generateSignPage({
      state, docLabel, docHtml, businessName,
      signEndpoint: base,
      declineEndpoint: `${base}/decline`,
      signedName: sig.signerName ?? undefined,
      successMessage: 'Your quote has been approved. Keep an eye on your inbox — your service agreement is on its way for signature.',
    });
    reply.type('text/html').send(html);
  });

  fastify.post('/api/public/sign/quote/:token', { config: publicRateLimit }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = publicSignSchema.parse(request.body);
    const ctx = await loadQuoteSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const { sig, quote } = ctx;

    if (!['pending', 'viewed'].includes(sig.status) || !['sent', 'viewed'].includes(quote.status)) {
      return reply.code(409).send({ error: 'INVALID_STATUS', message: 'This quote can no longer be signed from this link.' });
    }
    if (sig.expiresAt && new Date(sig.expiresAt) < new Date()) {
      return reply.code(410).send({ error: 'EXPIRED', message: 'This link has expired. Please request a new quote.' });
    }

    const { completeQuoteSignature, fulfillQuoteApproval } = await import('../../services/quote-signing.js');
    const signer = {
      signerName: body.signerName,
      signerEmail: body.signerEmail,
      signerPhone: body.signerPhone,
      ip: clientIp(request),
      forwardedFor: (request.headers['x-forwarded-for'] as string) ?? undefined,
      userAgent: (request.headers['user-agent'] as string) ?? undefined,
    };
    await completeQuoteSignature(fastify.db, sig.tenantId, quote.id, sig.id, signer);

    const [freshSig] = await fastify.db.select().from(documentSignatures)
      .where(eq(documentSignatures.id, sig.id)).limit(1);
    const { msaSent } = await fulfillQuoteApproval(fastify.db, sig.tenantId, quote, freshSig);

    return { success: true, msaSent };
  });

  fastify.post('/api/public/sign/quote/:token/decline', { config: publicRateLimit }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = publicDeclineSchema.parse(request.body ?? {});
    const ctx = await loadQuoteSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const { sig, quote } = ctx;

    if (!['pending', 'viewed'].includes(sig.status) || !['sent', 'viewed'].includes(quote.status)) {
      return reply.code(409).send({ error: 'INVALID_STATUS', message: 'This quote can no longer be declined from this link.' });
    }

    const { declineQuoteSignature } = await import('../../services/quote-signing.js');
    await declineQuoteSignature(fastify.db, sig.tenantId, quote.id, sig.id, {
      reason: body.reason,
      ip: clientIp(request),
      forwardedFor: (request.headers['x-forwarded-for'] as string) ?? undefined,
      userAgent: (request.headers['user-agent'] as string) ?? undefined,
    });

    const { notifyTenantStaff } = await import('../../services/notifications.js');
    try {
      await notifyTenantStaff(fastify.db, {
        tenantId: sig.tenantId, type: 'quote_declined',
        title: `Quote #${quote.quoteNumber} was declined`,
        body: body.reason || undefined,
        entityType: 'quote', entityId: quote.id,
      });
    } catch (err) {
      request.log.error({ err }, '[QUOTES] Decline notification failed');
    }

    return { success: true };
  });

  // Approve quote
  fastify.post('/api/v1/quotes/:id/approve', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    if (!['sent', 'viewed'].includes(existing.status)) throw new Error(`Cannot approve a quote with status "${existing.status}"`);
    const [updated] = await fastify.db.update(quotes).set({
      status: 'approved',
      approvedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).returning();
    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'quote.approved', entityType: 'quote', entityId: id, ipAddress: request.ip,
    });
    return updated;
  });

  // Reject quote
  fastify.post('/api/v1/quotes/:id/reject', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    if (!['sent', 'viewed'].includes(existing.status)) throw new Error(`Cannot reject a quote with status "${existing.status}"`);
    const [updated] = await fastify.db.update(quotes).set({ status: 'rejected', updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).returning();
    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'quote.rejected', entityType: 'quote', entityId: id, ipAddress: request.ip,
    });
    return updated;
  });

  // Revert a quote back to draft so it can be edited (change order) and re-sent.
  // Works from sent/viewed/approved/rejected — but not once converted to a
  // contract/invoice. Revokes any outstanding signing link and clears approval.
  fastify.post('/api/v1/quotes/:id/revert-to-draft', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    if (existing.status === 'draft') {
      reply.code(409).send({ error: 'INVALID_STATUS', message: 'This quote is already a draft.' });
      return;
    }
    if (existing.status === 'converted') {
      reply.code(409).send({ error: 'INVALID_STATUS', message: 'This quote has already been converted and cannot be reverted.' });
      return;
    }

    const now = new Date();
    await fastify.db.update(quotes).set({
      status: 'draft', approvedAt: null, approvedBy: null, declineReason: null, updatedAt: now,
    }).where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId)));

    // Kill any live signing link so the old link can't be used after edits.
    await fastify.db.update(documentSignatures)
      .set({ status: 'revoked', updatedAt: now })
      .where(and(
        eq(documentSignatures.tenantId, request.tenantId),
        eq(documentSignatures.entityType, 'quote'),
        eq(documentSignatures.entityId, id),
        inArray(documentSignatures.status, ['pending', 'viewed']),
      ));

    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'quote.reverted_to_draft', entityType: 'quote', entityId: id, ipAddress: request.ip,
      changes: { status: { old: existing.status, new: 'draft' } },
    });
    const [updated] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    return updated;
  });

  // Convert quote to contract or invoice
  fastify.post('/api/v1/quotes/:id/convert', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { convertTo: 'contract' | 'invoice' };

    const [quote] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!quote) throw new NotFoundError('Quote', id);

    const lineItems = await fastify.db.select().from(quoteLineItems)
      .where(and(eq(quoteLineItems.quoteId, id), eq(quoteLineItems.tenantId, request.tenantId)))
      .orderBy(quoteLineItems.sortOrder, quoteLineItems.createdAt);

    if (body.convertTo === 'contract') {
      // Create contract from quote
      const [contract] = await fastify.db.insert(contracts).values({
        tenantId: request.tenantId,
        customerId: quote.customerId,
        name: quote.title,
        contractType: 'managed_services',
        status: 'draft',
        startDate: new Date().toISOString().split('T')[0],
        billingCycle: 'monthly',
        notes: quote.summary ?? null,
      }).returning();

      // Create contract line items from quote line items
      for (const li of lineItems) {
        await fastify.db.insert(contractLineItems).values({
          tenantId: request.tenantId,
          contractId: contract.id,
          description: li.description,
          itemType: li.itemType,
          unitPriceCents: li.unitPriceCents,
          quantity: li.quantity ?? '1',
          taxable: li.taxable,
          sortOrder: li.sortOrder ?? 0,
        });
      }

      // Update quote with converted reference
      await fastify.db.update(quotes).set({
        status: 'converted',
        convertedContractId: contract.id,
        updatedAt: new Date(),
      }).where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId)));

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: 'quote.converted_to_contract', entityType: 'quote', entityId: id, ipAddress: request.ip,
      });

      reply.code(201);
      return { convertedTo: 'contract', contractId: contract.id, contract };
    }

    if (body.convertTo === 'invoice') {
      // Create invoice from quote
      const invoiceNumber = await getNextInvoiceNumber(fastify.db, request.tenantId);
      const today = new Date().toISOString().split('T')[0];
      const dueDateObj = new Date();
      dueDateObj.setDate(dueDateObj.getDate() + 30);
      const dueDate = dueDateObj.toISOString().split('T')[0];

      let subtotalCents = 0;
      const invoiceLines: { description: string; quantity: string; unitPriceCents: number; totalCents: number }[] = [];

      for (const li of lineItems) {
        const qty = parseFloat(li.quantity ?? '1');
        const lineTotal = Math.round(li.unitPriceCents * qty);
        subtotalCents += lineTotal;
        invoiceLines.push({
          description: li.description,
          quantity: li.quantity ?? '1',
          unitPriceCents: li.unitPriceCents,
          totalCents: lineTotal,
        });
      }

      const [invoice] = await fastify.db.insert(invoices).values({
        tenantId: request.tenantId,
        customerId: quote.customerId,
        invoiceNumber,
        status: 'draft',
        issueDate: today,
        dueDate,
        subtotalCents,
        taxCents: 0,
        totalCents: subtotalCents,
        amountPaidCents: 0,
        notes: `Converted from quote Q-${quote.quoteNumber}: ${quote.title}`,
      }).returning();

      for (const line of invoiceLines) {
        await fastify.db.insert(invoiceLineItems).values({
          tenantId: request.tenantId,
          invoiceId: invoice.id,
          description: line.description,
          quantity: line.quantity,
          unitPriceCents: line.unitPriceCents,
          totalCents: line.totalCents,
        });
      }

      // Recalculate totals so the converted invoice picks up tax like hand-built invoices
      await recalcInvoiceTotals(fastify.db, invoice.id, request.tenantId);
      const [freshInvoice] = await fastify.db.select().from(invoices)
        .where(and(eq(invoices.id, invoice.id), eq(invoices.tenantId, request.tenantId))).limit(1);

      // Update quote with converted reference
      await fastify.db.update(quotes).set({
        status: 'converted',
        convertedInvoiceId: invoice.id,
        updatedAt: new Date(),
      }).where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId)));

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: 'quote.converted_to_invoice', entityType: 'quote', entityId: id, ipAddress: request.ip,
      });

      reply.code(201);
      return { convertedTo: 'invoice', invoiceId: invoice.id, invoice: freshInvoice ?? invoice };
    }

    throw new Error('convertTo must be "contract" or "invoice"');
  });

  // Generate a short-lived preview token for HTML export
  fastify.post('/api/v1/quotes/:id/preview-token', {
    preHandler: [fastify.authenticate, requirePermission('quotes:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const token = fastify.jwt.sign(
      { sub: request.user.sub, tid: request.tenantId, role: request.user.role, type: 'preview' as const, resource: `quote:${id}` },
      { expiresIn: '60s' },
    );
    return { token };
  });

  // Printable HTML quote — uses short-lived preview token
  fastify.get('/api/v1/quotes/:id/html', {
    config: { public: true, rateLimit: { max: 30, timeWindow: '1 minute' } } as any,
  }, async (request, reply) => {
    const token = (request.query as Record<string, string>).token;
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }
    try {
      const { id } = request.params as { id: string };
      const payload = fastify.jwt.verify<{ sub: string; tid: string; type: string; resource?: string }>(token);
      if (payload.type !== 'preview' || payload.resource !== `quote:${id}`) { reply.code(401).send({ error: 'Invalid token' }); return; }
      (request as any).tenantId = payload.tid;
      (request as any).user = payload;
    } catch { reply.code(401).send({ error: 'Invalid or expired token' }); return; }
    const { id } = request.params as { id: string };
    const [quote] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!quote) throw new NotFoundError('Quote', id);

    const lineItemRows = await fastify.db.select().from(quoteLineItems)
      .where(eq(quoteLineItems.quoteId, id)).orderBy(quoteLineItems.sortOrder);

    const [customer] = await fastify.db.select().from(customers)
      .where(eq(customers.id, quote.customerId)).limit(1);

    const [tenant] = await fastify.db.select().from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const s = (tenant?.settings ?? {}) as Record<string, string>;

    const { generateQuoteHtml } = await import('../../services/template-renderer.js');
    const { formatDateLong } = await import('../../services/document-email.js');

    const html = generateQuoteHtml({
      businessName: s.businessName || tenant?.name || 'Company',
      businessAddress: s.businessAddress || '',
      businessCity: s.businessCity || '',
      businessState: s.businessState || '',
      businessZip: s.businessZip || '',
      businessPhone: s.businessPhone || '',
      businessEmail: s.businessEmail || '',
      businessLogo: s.businessLogo || '',
      customerName: customer?.name ?? 'Customer',
      customerAddress: customer?.address ?? '',
      customerCity: customer?.city ?? '',
      customerState: customer?.state ?? '',
      customerZip: customer?.zip ?? '',
      customerEmail: customer?.billingEmail ?? '',
      customerPhone: customer?.phone ?? '',
      quoteNumber: quote.quoteNumber,
      title: quote.title,
      validUntil: formatDateLong(quote.validUntil),
      summary: quote.summary ?? '',
      lineItems: lineItemRows.map(li => ({
        description: li.description,
        quantity: li.quantity ?? '1',
        unitPrice: (li.unitPriceCents / 100).toFixed(2),
        total: (parseFloat(li.quantity ?? '1') * li.unitPriceCents / 100).toFixed(2),
        ...quoteLineDiscount(li),
      })),
      subtotal: (quote.subtotalCents / 100).toFixed(2),
      tax: (quote.taxCents / 100).toFixed(2),
      total: (quote.totalCents / 100).toFixed(2),
      style: s.quoteStyle || 'modern',
      footer: s.quoteFooter || '',
    });

    reply.type('text/html').send(html);
  });
}

/**
 * A list price is only meaningful when it sits ABOVE the price being charged.
 * Anything at or below it is not a discount, so store null and let the document
 * render the line plainly rather than showing a zero or negative "saving".
 */
function normalizeListPrice(listCents: number | null | undefined, unitPriceCents: number): number | null {
  if (listCents == null) return null;
  if (!Number.isInteger(listCents) || listCents < 0) throw new Error('List price must be a non-negative amount');
  return listCents > unitPriceCents ? listCents : null;
}

async function recalcQuoteTotals(db: any, quoteId: string, tenantId: string) {
  const items = await db.select().from(quoteLineItems)
    .where(eq(quoteLineItems.quoteId, quoteId));

  let subtotalCents = 0;
  for (const item of items) {
    const qty = parseFloat(item.quantity ?? '1');
    subtotalCents += Math.round(item.unitPriceCents * qty);
  }

  const taxCents = 0; // Tax calculation TBD
  const totalCents = subtotalCents + taxCents;

  await db.update(quotes).set({
    subtotalCents,
    taxCents,
    totalCents,
    updatedAt: new Date(),
  }).where(and(eq(quotes.id, quoteId), eq(quotes.tenantId, tenantId)));
}
