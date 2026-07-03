import { sanitizeBody } from '../../common/sanitize.js';
import { FastifyInstance } from 'fastify';
import { eq, and, count, desc, sql } from 'drizzle-orm';
import {
  quotes,
  quoteLineItems,
  contracts,
  contractLineItems,
  customers,
  invoices,
  invoiceLineItems,
  tenants,
  tenantSequences,
} from '@rivertown/db';
import { createQuoteSchema, updateQuoteSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { recalcInvoiceTotals } from '../invoices/routes.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';

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
    const body = request.body as { description: string; itemType: string; unitPriceCents: number; quantity?: string; taxable?: boolean };
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
      quantity: body.quantity ?? '1',
      taxable: body.taxable ?? true,
    }).returning();

    // Recalculate quote totals
    await recalcQuoteTotals(fastify.db, id, request.tenantId);

    reply.code(201);
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

  // Send quote
  fastify.post('/api/v1/quotes/:id/send', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    const [updated] = await fastify.db.update(quotes).set({ status: 'sent', updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, request.tenantId))).returning();

    // Send email to customer with template + PDF attachment
    const { sendQuoteEmailWithTemplate } = await import('../../services/document-email.js');
    sendQuoteEmailWithTemplate(fastify.db, request.tenantId, id).catch(e => console.error('Quote email failed:', e));

    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'quote.sent', entityType: 'quote', entityId: id, ipAddress: request.ip,
    });
    return updated;
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
    config: { public: true } as any,
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
      validUntil: quote.validUntil ?? '',
      summary: quote.summary ?? '',
      lineItems: lineItemRows.map(li => ({
        description: li.description,
        quantity: li.quantity ?? '1',
        unitPrice: (li.unitPriceCents / 100).toFixed(2),
        total: (parseFloat(li.quantity ?? '1') * li.unitPriceCents / 100).toFixed(2),
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
