import { FastifyInstance } from 'fastify';
import { eq, and, count, desc, sql } from 'drizzle-orm';
import {
  invoices,
  invoiceLineItems,
  payments,
  contracts,
  contractLineItems,
  customers,
  tenants,
  tenantSequences,
} from '@rivertown/db';
import { createInvoiceSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';

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
    // Sequence row doesn't exist yet — create it
    await db.insert(tenantSequences).values({
      tenantId,
      sequenceName: 'invoice',
      currentValue: '1',
    });
    return 1;
  }

  return parseInt(result.value, 10);
}

export async function invoiceRoutes(fastify: FastifyInstance) {
  // List invoices
  fastify.get('/api/v1/invoices', { preHandler: [fastify.authenticate, requirePermission('invoices:read')] }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const params = request.query as Record<string, string>;
    const { offset, limit } = paginationToOffset(query);
    const conditions = [eq(invoices.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(invoices.customerId, params.customerId));
    if (params.status) conditions.push(eq(invoices.status, params.status));
    const where = and(...conditions);
    const [data, [{ total }]] = await Promise.all([
      fastify.db.select().from(invoices).where(where).limit(limit).offset(offset).orderBy(desc(invoices.createdAt)),
      fastify.db.select({ total: count() }).from(invoices).where(where),
    ]);
    return paginate(data, total, query);
  });

  // Get invoice with line items
  fastify.get('/api/v1/invoices/:id', { preHandler: [fastify.authenticate, requirePermission('invoices:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const lineItems = await fastify.db.select().from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id))
      .orderBy(invoiceLineItems.sortOrder, invoiceLineItems.createdAt);

    const invoicePayments = await fastify.db.select().from(payments)
      .where(eq(payments.invoiceId, id))
      .orderBy(desc(payments.paidAt));

    return { ...invoice, lineItems, payments: invoicePayments };
  });

  // Create invoice
  fastify.post('/api/v1/invoices', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const body = createInvoiceSchema.parse(request.body);
    const invoiceNumber = await getNextInvoiceNumber(fastify.db, request.tenantId);
    const [invoice] = await fastify.db.insert(invoices).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      invoiceNumber,
      status: 'draft',
      issueDate: body.issueDate,
      dueDate: body.dueDate,
      notes: body.notes,
      subtotalCents: 0,
      taxCents: 0,
      totalCents: 0,
      amountPaidCents: 0,
    }).returning();
    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'invoice.created', entityType: 'invoice', entityId: invoice.id, ipAddress: request.ip,
    });
    reply.code(201);
    return invoice;
  });

  // Update invoice
  fastify.patch('/api/v1/invoices/:id', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [existing] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Invoice', id);

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.issueDate !== undefined) updates.issueDate = body.issueDate;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate;

    const [updated] = await fastify.db.update(invoices).set(updates)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).returning();
    return updated;
  });

  // Delete invoice + line items
  fastify.delete('/api/v1/invoices/:id', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Invoice', id);
    await fastify.db.delete(payments).where(eq(payments.invoiceId, id));
    await fastify.db.delete(invoiceLineItems).where(eq(invoiceLineItems.invoiceId, id));
    await fastify.db.delete(invoices).where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId)));
    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'invoice.deleted', entityType: 'invoice', entityId: id, ipAddress: request.ip,
    });
    reply.code(204).send();
  });

  // Add line item to invoice
  fastify.post('/api/v1/invoices/:id/line-items', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { description: string; quantity?: string; unitPriceCents: number };
    const qty = parseFloat(body.quantity ?? '1');
    const totalCents = Math.round(body.unitPriceCents * qty);

    const [item] = await fastify.db.insert(invoiceLineItems).values({
      tenantId: request.tenantId,
      invoiceId: id,
      description: body.description,
      quantity: body.quantity ?? '1',
      unitPriceCents: body.unitPriceCents,
      totalCents,
    }).returning();

    // Recalculate invoice totals
    await recalcInvoiceTotals(fastify.db, id, request.tenantId);

    reply.code(201);
    return item;
  });

  // Remove line item
  fastify.delete('/api/v1/invoices/:id/line-items/:lineId', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const { id, lineId } = request.params as { id: string; lineId: string };
    await fastify.db.delete(invoiceLineItems)
      .where(and(eq(invoiceLineItems.id, lineId), eq(invoiceLineItems.tenantId, request.tenantId)));

    // Recalculate invoice totals
    await recalcInvoiceTotals(fastify.db, id, request.tenantId);

    reply.code(204).send();
  });

  // Send invoice email
  fastify.post('/api/v1/invoices/:id/send-email', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const [customer] = await fastify.db.select().from(customers)
      .where(eq(customers.id, invoice.customerId)).limit(1);
    if (!customer?.billingEmail) return { sent: false, reason: 'No billing email' };

    const { sendInvoiceEmail } = await import('../../services/email.js');
    const sent = await sendInvoiceEmail(fastify.db, request.tenantId, customer.billingEmail, invoice.invoiceNumber, invoice.totalCents, invoice.dueDate);
    return { sent };
  });

  // Record payment
  fastify.post('/api/v1/invoices/:id/record-payment', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { amountCents: number; paymentMethod: string; reference?: string };

    const [existing] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Invoice', id);

    const [payment] = await fastify.db.insert(payments).values({
      tenantId: request.tenantId,
      invoiceId: id,
      amountCents: body.amountCents,
      paymentMethod: body.paymentMethod,
      reference: body.reference ?? null,
      paidAt: new Date(),
    }).returning();

    // Update invoice amountPaidCents and status
    const newPaid = existing.amountPaidCents + body.amountCents;
    const newStatus = newPaid >= existing.totalCents ? 'paid' : existing.status === 'draft' ? 'sent' : existing.status;

    await fastify.db.update(invoices).set({
      amountPaidCents: newPaid,
      status: newStatus,
      updatedAt: new Date(),
    }).where(eq(invoices.id, id));

    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'invoice.payment_recorded', entityType: 'invoice', entityId: id, ipAddress: request.ip,
    });

    reply.code(201);
    return payment;
  });

  // Generate invoices from active contracts
  fastify.post('/api/v1/invoices/generate', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const body = request.body as { issueDate?: string; dueDate?: string } | null;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    const issueDate = body?.issueDate ?? todayStr;
    const dueDate = body?.dueDate ?? (() => {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + 30);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    })();

    // Service period = the month of the due date (billing ahead of services)
    const dueDateObj = new Date(dueDate + 'T00:00:00');
    const serviceMonthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const servicePeriod = `${serviceMonthNames[dueDateObj.getMonth()]} ${dueDateObj.getFullYear()}`;

    // Get all active contracts for this tenant
    const activeContracts = await fastify.db.select().from(contracts)
      .where(and(eq(contracts.tenantId, request.tenantId), eq(contracts.status, 'active')));

    const createdInvoices = [];

    for (const contract of activeContracts) {
      // Get line items for this contract
      const lineItems = await fastify.db.select().from(contractLineItems)
        .where(eq(contractLineItems.contractId, contract.id))
        .orderBy(contractLineItems.sortOrder, contractLineItems.createdAt);

      if (lineItems.length === 0) continue;

      const invoiceNumber = await getNextInvoiceNumber(fastify.db, request.tenantId);

      // Calculate subtotal from line items
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

      const taxCents = 0;
      const totalCents = subtotalCents + taxCents;

      // Create the invoice
      const [invoice] = await fastify.db.insert(invoices).values({
        tenantId: request.tenantId,
        customerId: contract.customerId,
        invoiceNumber,
        status: 'draft',
        issueDate,
        dueDate,
        subtotalCents,
        taxCents,
        totalCents,
        amountPaidCents: 0,
        notes: `Services for ${servicePeriod} — ${contract.name}`,
      }).returning();

      // Create invoice line items
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

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: 'invoice.generated', entityType: 'invoice', entityId: invoice.id, ipAddress: request.ip,
      });

      createdInvoices.push(invoice);
    }

    reply.code(201);
    return { created: createdInvoices.length, invoices: createdInvoices };
  });

  // Printable HTML invoice (for PDF export)
  // Uses ?token= query param since window.open() can't send Bearer headers
  fastify.get('/api/v1/invoices/:id/html', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const token = (request.query as Record<string, string>).token;
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }
    try {
      const payload = fastify.jwt.verify<{ sub: string; tid: string; type: string }>(token);
      if (payload.type !== 'access') { reply.code(401).send({ error: 'Invalid token' }); return; }
      (request as any).tenantId = payload.tid;
      (request as any).user = payload;
    } catch { reply.code(401).send({ error: 'Invalid token' }); return; }
    const { id } = request.params as { id: string };
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const lineItemRows = await fastify.db.select().from(invoiceLineItems)
      .where(eq(invoiceLineItems.invoiceId, id)).orderBy(invoiceLineItems.sortOrder);

    const [customer] = await fastify.db.select().from(customers)
      .where(eq(customers.id, invoice.customerId)).limit(1);

    const [tenant] = await fastify.db.select().from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const s = (tenant?.settings ?? {}) as Record<string, string>;

    const { generateInvoiceHtml } = await import('../../services/template-renderer.js');

    const html = generateInvoiceHtml({
      businessName: s.businessName || tenant?.name || 'Company',
      businessAddress: s.businessAddress || '',
      businessCity: s.businessCity || '',
      businessState: s.businessState || '',
      businessZip: s.businessZip || '',
      businessPhone: s.businessPhone || '',
      businessEmail: s.businessEmail || '',
      businessLogo: s.businessLogo || '',
      businessWebsite: s.businessWebsite || '',
      customerName: customer?.name ?? 'Customer',
      customerAddress: customer?.address ?? '',
      customerCity: customer?.city ?? '',
      customerState: customer?.state ?? '',
      customerZip: customer?.zip ?? '',
      customerEmail: customer?.billingEmail ?? '',
      customerPhone: customer?.phone ?? '',
      invoiceNumber: invoice.invoiceNumber,
      issueDate: invoice.issueDate,
      dueDate: invoice.dueDate,
      notes: invoice.notes ?? '',
      lineItems: lineItemRows.map(li => ({
        description: li.description,
        quantity: li.quantity ?? '1',
        unitPrice: (li.unitPriceCents / 100).toFixed(2),
        total: (li.totalCents / 100).toFixed(2),
      })),
      subtotal: (invoice.subtotalCents / 100).toFixed(2),
      tax: (invoice.taxCents / 100).toFixed(2),
      total: (invoice.totalCents / 100).toFixed(2),
      paid: (invoice.amountPaidCents / 100).toFixed(2),
      balance: ((invoice.totalCents - invoice.amountPaidCents) / 100).toFixed(2),
      style: s.invoiceStyle || 'modern',
      footer: s.invoiceFooter || '',
      paymentTerms: s.invoicePaymentTerms || '',
    });

    reply.type('text/html').send(html);
  });
}

async function recalcInvoiceTotals(db: any, invoiceId: string, tenantId: string) {
  const items = await db.select().from(invoiceLineItems)
    .where(eq(invoiceLineItems.invoiceId, invoiceId));

  let subtotalCents = 0;
  for (const item of items) {
    subtotalCents += item.totalCents;
  }

  const taxCents = 0; // Tax calculation TBD
  const totalCents = subtotalCents + taxCents;

  await db.update(invoices).set({
    subtotalCents,
    taxCents,
    totalCents,
    updatedAt: new Date(),
  }).where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
}
