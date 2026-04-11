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
  accountCredits,
} from '@rivertown/db';
import Stripe from 'stripe';
import { createInvoiceSchema, paginationSchema } from '@rivertown/shared';
import { integrationConfigs } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
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
      .where(and(eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.tenantId, request.tenantId)))
      .orderBy(invoiceLineItems.sortOrder, invoiceLineItems.createdAt);

    const invoicePayments = await fastify.db.select().from(payments)
      .where(and(eq(payments.invoiceId, id), eq(payments.tenantId, request.tenantId)))
      .orderBy(desc(payments.paidAt));

    return { ...invoice, lineItems, payments: invoicePayments };
  });

  // Create invoice
  fastify.post('/api/v1/invoices', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const body = createInvoiceSchema.parse(request.body);

    // Validate customer belongs to this tenant
    const [cust] = await fastify.db.select({ id: customers.id }).from(customers)
      .where(and(eq(customers.id, body.customerId), eq(customers.tenantId, request.tenantId))).limit(1);
    if (!cust) throw new NotFoundError('Customer', body.customerId);

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

  // Delete invoice + line items (block if paid or cancelled)
  fastify.delete('/api/v1/invoices/:id', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Invoice', id);
    if (existing.status === 'paid') throw new ValidationError('Cannot delete a paid invoice. Credit the invoice instead.');
    if (existing.status === 'cancelled') throw new ValidationError('Cannot delete a cancelled invoice.');
    if (existing.amountPaidCents > 0) throw new ValidationError('Cannot delete an invoice with payments recorded. Credit the invoice instead.');
    await fastify.db.delete(payments).where(and(eq(payments.invoiceId, id), eq(payments.tenantId, request.tenantId)));
    await fastify.db.delete(invoiceLineItems).where(and(eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.tenantId, request.tenantId)));
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
    const body = request.body as { description: string; quantity?: string; unitPriceCents: number; catalogItemId?: string };

    // Verify invoice belongs to this tenant
    const [inv] = await fastify.db.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!inv) throw new NotFoundError('Invoice', id);

    const qty = parseFloat(body.quantity ?? '1');
    if (!isFinite(qty) || qty <= 0) throw new ValidationError('Quantity must be a positive number');
    if (!isFinite(body.unitPriceCents) || body.unitPriceCents < 0) throw new ValidationError('Unit price must be non-negative');
    const totalCents = Math.round(body.unitPriceCents * qty);

    // If catalogItemId provided, look up cost from catalog
    let unitCostCents: number | null = null;
    if (body.catalogItemId) {
      const { serviceCatalogItems } = await import('@rivertown/db');
      const [catItem] = await fastify.db.select({ cost: serviceCatalogItems.defaultUnitCostCents })
        .from(serviceCatalogItems)
        .where(and(eq(serviceCatalogItems.id, body.catalogItemId), eq(serviceCatalogItems.tenantId, request.tenantId)))
        .limit(1);
      if (catItem?.cost) unitCostCents = catItem.cost;
    }

    const [item] = await fastify.db.insert(invoiceLineItems).values({
      tenantId: request.tenantId,
      invoiceId: id,
      description: body.description,
      quantity: body.quantity ?? '1',
      unitPriceCents: body.unitPriceCents,
      totalCents,
      unitCostCents,
      catalogItemId: body.catalogItemId ?? null,
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

    const { sendInvoiceEmailWithTemplate } = await import('../../services/document-email.js');
    const sent = await sendInvoiceEmailWithTemplate(fastify.db, request.tenantId, id, fastify.jwt.sign.bind(fastify.jwt));

    // Sync invoice to QuickBooks (fire and forget)
    import('../../services/qbo-sync.js').then(({ syncInvoiceToQBO }) => {
      syncInvoiceToQBO(fastify.db, request.tenantId, id).catch(e => console.error('[QBO] Invoice sync failed:', e));
    });

    return { sent };
  });

  // Record payment
  fastify.post('/api/v1/invoices/:id/record-payment', { preHandler: [fastify.authenticate, requirePermission('invoices:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { amountCents: number; paymentMethod: string; reference?: string };

    if (!body.amountCents || body.amountCents <= 0) throw new ValidationError('Payment amount must be positive');

    const [existing] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Invoice', id);

    const remainingBalance = existing.totalCents - existing.amountPaidCents;
    if (body.amountCents > remainingBalance && remainingBalance > 0) {
      throw new ValidationError(`Payment amount ($${(body.amountCents / 100).toFixed(2)}) exceeds remaining balance ($${(remainingBalance / 100).toFixed(2)})`);
    }

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

    // Send payment receipt email (fire and forget)
    import('../../services/document-email.js').then(({ sendPaymentReceiptEmail }) => {
      sendPaymentReceiptEmail(fastify.db, request.tenantId, id, body.amountCents, fastify.jwt.sign.bind(fastify.jwt)).catch(e => console.error('Payment receipt email failed:', e));
    });

    // Sync payment to QuickBooks (fire and forget)
    import('../../services/qbo-sync.js').then(({ syncPaymentToQBO }) => {
      syncPaymentToQBO(fastify.db, request.tenantId, payment.id).catch(e => console.error('[QBO] Payment sync failed:', e));
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
      const invoiceLines: { description: string; quantity: string; unitPriceCents: number; totalCents: number; unitCostCents: number | null; catalogItemId: string | null }[] = [];

      for (const li of lineItems) {
        const qty = parseFloat(li.quantity ?? '1');
        const lineTotal = Math.round(li.unitPriceCents * qty);
        subtotalCents += lineTotal;
        invoiceLines.push({
          description: li.description,
          quantity: li.quantity ?? '1',
          unitPriceCents: li.unitPriceCents,
          totalCents: lineTotal,
          unitCostCents: li.unitCostCents ?? null,
          catalogItemId: li.catalogItemId ?? null,
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
          unitCostCents: line.unitCostCents,
          catalogItemId: line.catalogItemId,
        });
      }

      // Auto-apply account credits if customer has a balance
      const [cust] = await fastify.db.select().from(customers).where(and(eq(customers.id, contract.customerId), eq(customers.tenantId, request.tenantId))).limit(1);
      if (cust && cust.creditBalanceCents > 0) {
        const invBalance = invoice.totalCents;
        const toApply = Math.min(cust.creditBalanceCents, invBalance);
        if (toApply > 0) {
          const newCreditBal = cust.creditBalanceCents - toApply;
          await fastify.db.insert(accountCredits).values({
            tenantId: request.tenantId, customerId: cust.id, type: 'debit',
            amountCents: -toApply, balanceAfterCents: newCreditBal,
            invoiceId: invoice.id, reason: `Auto-applied to Invoice #${invoice.invoiceNumber}`,
            createdBy: request.user.sub,
          });
          await fastify.db.update(customers).set({ creditBalanceCents: newCreditBal, updatedAt: new Date() }).where(eq(customers.id, cust.id));
          const newStatus = toApply >= invoice.totalCents ? 'paid' : 'draft';
          await fastify.db.update(invoices).set({ creditsAppliedCents: toApply, status: newStatus, updatedAt: new Date() }).where(eq(invoices.id, invoice.id));
          Object.assign(invoice, { creditsAppliedCents: toApply, status: newStatus });
        }
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

  // ===== ACCOUNT CREDITS =====

  // Issue a credit to a customer account (e.g., from cancelled invoice)
  fastify.post('/api/v1/customers/:customerId/credits', {
    preHandler: [fastify.authenticate, requirePermission('invoices:write')]
  }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const body = request.body as { amountCents: number; reason: string; invoiceId?: string };

    if (!body.amountCents || body.amountCents <= 0) throw new ValidationError('Credit amount must be positive');

    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, request.tenantId))).limit(1);
    if (!customer) throw new NotFoundError('Customer', customerId);

    const newBalance = customer.creditBalanceCents + body.amountCents;

    // Record the credit transaction
    const [credit] = await fastify.db.insert(accountCredits).values({
      tenantId: request.tenantId,
      customerId,
      type: 'credit',
      amountCents: body.amountCents,
      balanceAfterCents: newBalance,
      invoiceId: body.invoiceId || null,
      reason: body.reason,
      createdBy: request.user.sub,
    }).returning();

    // Update customer balance
    await fastify.db.update(customers).set({
      creditBalanceCents: newBalance, updatedAt: new Date(),
    }).where(eq(customers.id, customerId));

    reply.code(201);
    return credit;
  });

  // Get credit history for a customer
  fastify.get('/api/v1/customers/:customerId/credits', {
    preHandler: [fastify.authenticate, requirePermission('invoices:read')]
  }, async (request) => {
    const { customerId } = request.params as { customerId: string };
    return fastify.db.select().from(accountCredits)
      .where(and(eq(accountCredits.customerId, customerId), eq(accountCredits.tenantId, request.tenantId)))
      .orderBy(desc(accountCredits.createdAt));
  });

  // Apply account credit to an invoice
  fastify.post('/api/v1/invoices/:id/apply-credit', {
    preHandler: [fastify.authenticate, requirePermission('invoices:write')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { amountCents?: number };

    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, request.tenantId))).limit(1);
    if (!customer) throw new NotFoundError('Customer', invoice.customerId);

    const balance = invoice.totalCents - invoice.amountPaidCents - invoice.creditsAppliedCents;
    if (balance <= 0) return { applied: 0, message: 'Invoice already fully paid' };

    const available = customer.creditBalanceCents;
    if (available <= 0) return { applied: 0, message: 'No credit balance available' };

    const toApply = body.amountCents ? Math.min(body.amountCents, available, balance) : Math.min(available, balance);

    const newCreditBalance = customer.creditBalanceCents - toApply;
    const newCreditsApplied = invoice.creditsAppliedCents + toApply;
    const totalPaidAndCredits = invoice.amountPaidCents + newCreditsApplied;
    const newStatus = totalPaidAndCredits >= invoice.totalCents ? 'paid' : invoice.status;

    // Record debit transaction
    await fastify.db.insert(accountCredits).values({
      tenantId: request.tenantId,
      customerId: customer.id,
      type: 'debit',
      amountCents: -toApply,
      balanceAfterCents: newCreditBalance,
      invoiceId: id,
      reason: `Applied to Invoice #${invoice.invoiceNumber}`,
      createdBy: request.user.sub,
    });

    // Update customer balance
    await fastify.db.update(customers).set({
      creditBalanceCents: newCreditBalance, updatedAt: new Date(),
    }).where(eq(customers.id, customer.id));

    // Update invoice
    await fastify.db.update(invoices).set({
      creditsAppliedCents: newCreditsApplied,
      status: newStatus,
      updatedAt: new Date(),
    }).where(eq(invoices.id, id));

    return { applied: toApply, newInvoiceStatus: newStatus, remainingCredit: newCreditBalance };
  });

  // Credit an invoice (reverse/cancel → add credit to customer account)
  fastify.post('/api/v1/invoices/:id/credit', {
    preHandler: [fastify.authenticate, requirePermission('invoices:write')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { reason?: string };

    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, request.tenantId))).limit(1);
    if (!customer) throw new NotFoundError('Customer', invoice.customerId);

    // Credit the full invoice amount
    const creditAmount = invoice.totalCents;
    const newBalance = customer.creditBalanceCents + creditAmount;

    await fastify.db.insert(accountCredits).values({
      tenantId: request.tenantId,
      customerId: customer.id,
      type: 'credit',
      amountCents: creditAmount,
      balanceAfterCents: newBalance,
      invoiceId: id,
      reason: body.reason || `Credit from Invoice #${invoice.invoiceNumber}`,
      createdBy: request.user.sub,
    });

    await fastify.db.update(customers).set({
      creditBalanceCents: newBalance, updatedAt: new Date(),
    }).where(eq(customers.id, customer.id));

    // Mark invoice as credited
    await fastify.db.update(invoices).set({
      status: 'cancelled', notes: `${invoice.notes ? invoice.notes + '\n' : ''}Credited to account: $${(creditAmount / 100).toFixed(2)} — ${body.reason || 'Invoice reversal'}`,
      updatedAt: new Date(),
    }).where(eq(invoices.id, id));

    return { credited: creditAmount, newBalance, invoiceStatus: 'cancelled' };
  });

  // Generate a short-lived preview token for HTML export
  fastify.post('/api/v1/invoices/:id/preview-token', {
    preHandler: [fastify.authenticate, requirePermission('invoices:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const token = fastify.jwt.sign(
      { sub: request.user.sub, tid: request.tenantId, role: request.user.role, type: 'preview' as const, resource: `invoice:${id}` },
      { expiresIn: '60s' },
    );
    return { token };
  });

  // Printable HTML invoice (for PDF export)
  // Uses short-lived preview token in query param
  fastify.get('/api/v1/invoices/:id/html', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const token = (request.query as Record<string, string>).token;
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }
    try {
      const { id } = request.params as { id: string };
      const payload = fastify.jwt.verify<{ sub: string; tid: string; type: string; resource?: string }>(token);
      if (payload.type !== 'preview' || payload.resource !== `invoice:${id}`) { reply.code(401).send({ error: 'Invalid token' }); return; }
      (request as any).tenantId = payload.tid;
      (request as any).user = payload;
    } catch { reply.code(401).send({ error: 'Invalid or expired token' }); return; }
    const { id } = request.params as { id: string };
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, request.tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const lineItemRows = await fastify.db.select().from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.tenantId, request.tenantId))).orderBy(invoiceLineItems.sortOrder);

    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, request.tenantId))).limit(1);

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
      paid: ((invoice.amountPaidCents + (invoice.creditsAppliedCents ?? 0)) / 100).toFixed(2),
      balance: ((invoice.totalCents - invoice.amountPaidCents - (invoice.creditsAppliedCents ?? 0)) / 100).toFixed(2),
      style: s.invoiceStyle || 'modern',
      footer: s.invoiceFooter || '',
      paymentTerms: s.invoicePaymentTerms || '',
    });

    reply.type('text/html').send(html);
  });

  // ===== PUBLIC INVOICE VIEW (30-day token, no login) =====

  fastify.get('/api/v1/invoices/:id/view', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const token = (request.query as Record<string, string>).token;
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }

    let payload: { tid: string; type: string; invoiceId?: string };
    try {
      payload = fastify.jwt.verify(token);
    } catch {
      reply.type('text/html').send('<html><body style="font-family:system-ui;text-align:center;padding:80px"><h1>Link Expired</h1><p>This invoice link has expired. Please contact us for a new link.</p></body></html>');
      return;
    }

    if (payload.type !== 'invoice_view' || payload.invoiceId !== id) {
      reply.code(401).send({ error: 'Invalid token' }); return;
    }

    const tenantId = payload.tid;
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const lineItemRows = await fastify.db.select().from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.tenantId, tenantId)))
      .orderBy(invoiceLineItems.sortOrder);

    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))).limit(1);

    const [tenant] = await fastify.db.select().from(tenants)
      .where(eq(tenants.id, tenantId)).limit(1);
    const s = (tenant?.settings ?? {}) as Record<string, string>;

    const { generateInvoiceHtml, generateInvoiceViewPage } = await import('../../services/template-renderer.js');

    const balanceCents = invoice.totalCents - invoice.amountPaidCents - (invoice.creditsAppliedCents ?? 0);
    const isPaid = invoice.status === 'paid' || balanceCents <= 0;

    const invoiceHtml = generateInvoiceHtml({
      businessName: s.businessName || tenant?.name || 'Company',
      businessAddress: s.businessAddress || '', businessCity: s.businessCity || '',
      businessState: s.businessState || '', businessZip: s.businessZip || '',
      businessPhone: s.businessPhone || '', businessEmail: s.businessEmail || '',
      businessLogo: s.businessLogo || '', businessWebsite: s.businessWebsite || '',
      customerName: customer?.name ?? 'Customer',
      customerAddress: customer?.address ?? undefined, customerCity: customer?.city ?? undefined,
      customerState: customer?.state ?? undefined, customerZip: customer?.zip ?? undefined,
      customerEmail: customer?.billingEmail ?? undefined, customerPhone: customer?.phone ?? undefined,
      invoiceNumber: invoice.invoiceNumber, issueDate: invoice.issueDate, dueDate: invoice.dueDate,
      notes: invoice.notes ?? '',
      lineItems: lineItemRows.map(li => ({
        description: li.description, quantity: li.quantity ?? '1',
        unitPrice: (li.unitPriceCents / 100).toFixed(2), total: (li.totalCents / 100).toFixed(2),
      })),
      subtotal: (invoice.subtotalCents / 100).toFixed(2), tax: (invoice.taxCents / 100).toFixed(2),
      total: (invoice.totalCents / 100).toFixed(2),
      paid: ((invoice.amountPaidCents + (invoice.creditsAppliedCents ?? 0)) / 100).toFixed(2),
      balance: (balanceCents / 100).toFixed(2),
      style: s.invoiceStyle || 'modern', footer: s.invoiceFooter || '', paymentTerms: s.invoicePaymentTerms || '',
    });

    // Strip the wrapping <html>/<body> from the inner invoice — we'll wrap it in the view page
    const innerHtml = invoiceHtml.replace(/<!DOCTYPE html>[\s\S]*?<div class="page">/, '<div class="page">')
      .replace(/<\/body><\/html>/, '');

    const payUrl = !isPaid ? `/api/v1/invoices/${id}/pay?token=${encodeURIComponent(token)}` : '';

    // Calculate expiry date from JWT
    const jwtPayload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
    const expiresAt = new Date(jwtPayload.exp * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    const paymentResult = (request.query as Record<string, string>).payment as 'success' | 'cancelled' | undefined;

    const page = generateInvoiceViewPage({
      invoiceHtml: innerHtml,
      invoiceNumber: invoice.invoiceNumber,
      balanceCents,
      isPaid,
      payUrl,
      expiresAt,
      businessName: s.businessName || tenant?.name || 'Company',
      paymentResult: paymentResult || null,
    });

    reply.type('text/html').send(page);
  });

  // ===== PUBLIC PAY INVOICE (creates Stripe checkout on-demand) =====

  fastify.post('/api/v1/invoices/:id/pay', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const token = (request.query as Record<string, string>).token;
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }

    let payload: { tid: string; type: string; invoiceId?: string };
    try {
      payload = fastify.jwt.verify(token);
    } catch {
      reply.code(401).send({ error: 'Token expired or invalid' }); return;
    }

    if (payload.type !== 'invoice_view' || payload.invoiceId !== id) {
      reply.code(401).send({ error: 'Invalid token' }); return;
    }

    const tenantId = payload.tid;
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const balanceCents = invoice.totalCents - invoice.amountPaidCents - (invoice.creditsAppliedCents ?? 0);
    if (balanceCents <= 0) {
      reply.redirect(`/api/v1/invoices/${id}/view?token=${encodeURIComponent(token)}&payment=success`);
      return;
    }

    // Get Stripe config
    const [stripeConfig] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'stripe'), eq(integrationConfigs.isEnabled, true)))
      .limit(1);
    const stripeCreds = (stripeConfig?.credentials ?? {}) as Record<string, string>;

    if (!stripeCreds.secretKey) {
      reply.type('text/html').send('<html><body style="font-family:system-ui;text-align:center;padding:80px"><h1>Online Payment Unavailable</h1><p>Please contact us for payment options.</p></body></html>');
      return;
    }

    const stripe = new Stripe(stripeCreds.secretKey);

    // Get or create Stripe customer
    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))).limit(1);

    let stripeCustomerId = customer?.stripeCustomerId;
    if (!stripeCustomerId && customer) {
      const sc = await stripe.customers.create({
        name: customer.name, email: customer.billingEmail || undefined,
        metadata: { tenantId, customerId: customer.id },
      });
      stripeCustomerId = sc.id;
      await fastify.db.update(customers).set({ stripeCustomerId }).where(eq(customers.id, customer.id));
    }

    // Fetch line items for Stripe checkout detail
    const lineItemRows = await fastify.db.select().from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.tenantId, tenantId)))
      .orderBy(invoiceLineItems.sortOrder);

    // Build Stripe line items from invoice line items
    const stripeLineItems = lineItemRows.length > 0
      ? lineItemRows.map(li => ({
          price_data: {
            currency: 'usd' as const,
            unit_amount: li.unitPriceCents,
            product_data: { name: li.description },
          },
          quantity: Math.max(1, Math.round(parseFloat(li.quantity ?? '1'))),
        }))
      : [{
          price_data: {
            currency: 'usd' as const,
            unit_amount: balanceCents,
            product_data: { name: `Invoice #${invoice.invoiceNumber}` },
          },
          quantity: 1,
        }];

    // Add tax as a separate line item if present
    if (invoice.taxCents > 0 && lineItemRows.length > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: invoice.taxCents,
          product_data: { name: 'Sales Tax' },
        },
        quantity: 1,
      });
    }

    const apiBaseUrl = fastify.config.API_BASE_URL || 'https://rivertownapi-production.up.railway.app';
    const viewUrl = `${apiBaseUrl}/api/v1/invoices/${id}/view?token=${encodeURIComponent(token)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId || undefined,
      customer_email: !stripeCustomerId ? (customer?.billingEmail || undefined) : undefined,
      line_items: stripeLineItems,
      metadata: { tenantId, invoiceId: invoice.id, invoiceNumber: String(invoice.invoiceNumber) },
      success_url: `${viewUrl}&payment=success`,
      cancel_url: `${viewUrl}&payment=cancelled`,
    });

    await fastify.db.update(invoices).set({ stripeInvoiceId: session.id, updatedAt: new Date() })
      .where(eq(invoices.id, id));

    reply.redirect(session.url!);
  });

  // Also support GET for the pay endpoint (for the link in the view page)
  fastify.get('/api/v1/invoices/:id/pay', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const token = (request.query as Record<string, string>).token;
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }

    let payload: { tid: string; type: string; invoiceId?: string };
    try {
      payload = fastify.jwt.verify(token);
    } catch {
      reply.code(401).send({ error: 'Token expired or invalid' }); return;
    }

    if (payload.type !== 'invoice_view' || payload.invoiceId !== id) {
      reply.code(401).send({ error: 'Invalid token' }); return;
    }

    const tenantId = payload.tid;
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, tenantId))).limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);

    const balanceCents = invoice.totalCents - invoice.amountPaidCents - (invoice.creditsAppliedCents ?? 0);
    if (balanceCents <= 0) {
      reply.redirect(`/api/v1/invoices/${id}/view?token=${encodeURIComponent(token)}&payment=success`);
      return;
    }

    const [stripeConfig] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'stripe'), eq(integrationConfigs.isEnabled, true)))
      .limit(1);
    const stripeCreds = (stripeConfig?.credentials ?? {}) as Record<string, string>;

    if (!stripeCreds.secretKey) {
      reply.type('text/html').send('<html><body style="font-family:system-ui;text-align:center;padding:80px"><h1>Online Payment Unavailable</h1><p>Please contact us for payment options.</p></body></html>');
      return;
    }

    const stripe = new Stripe(stripeCreds.secretKey);
    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))).limit(1);

    let stripeCustomerId = customer?.stripeCustomerId;
    if (!stripeCustomerId && customer) {
      const sc = await stripe.customers.create({
        name: customer.name, email: customer.billingEmail || undefined,
        metadata: { tenantId, customerId: customer.id },
      });
      stripeCustomerId = sc.id;
      await fastify.db.update(customers).set({ stripeCustomerId }).where(eq(customers.id, customer.id));
    }

    // Fetch line items for Stripe checkout detail
    const lineItemRows = await fastify.db.select().from(invoiceLineItems)
      .where(and(eq(invoiceLineItems.invoiceId, id), eq(invoiceLineItems.tenantId, tenantId)))
      .orderBy(invoiceLineItems.sortOrder);

    const stripeLineItems = lineItemRows.length > 0
      ? lineItemRows.map(li => ({
          price_data: {
            currency: 'usd' as const,
            unit_amount: li.unitPriceCents,
            product_data: { name: li.description },
          },
          quantity: Math.max(1, Math.round(parseFloat(li.quantity ?? '1'))),
        }))
      : [{
          price_data: {
            currency: 'usd' as const,
            unit_amount: balanceCents,
            product_data: { name: `Invoice #${invoice.invoiceNumber}` },
          },
          quantity: 1,
        }];

    if (invoice.taxCents > 0 && lineItemRows.length > 0) {
      stripeLineItems.push({
        price_data: {
          currency: 'usd',
          unit_amount: invoice.taxCents,
          product_data: { name: 'Sales Tax' },
        },
        quantity: 1,
      });
    }

    const apiBaseUrl = fastify.config.API_BASE_URL || 'https://rivertownapi-production.up.railway.app';
    const viewUrl = `${apiBaseUrl}/api/v1/invoices/${id}/view?token=${encodeURIComponent(token)}`;

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      customer: stripeCustomerId || undefined,
      customer_email: !stripeCustomerId ? (customer?.billingEmail || undefined) : undefined,
      line_items: stripeLineItems,
      metadata: { tenantId, invoiceId: invoice.id, invoiceNumber: String(invoice.invoiceNumber) },
      success_url: `${viewUrl}&payment=success`,
      cancel_url: `${viewUrl}&payment=cancelled`,
    });

    await fastify.db.update(invoices).set({ stripeInvoiceId: session.id, updatedAt: new Date() })
      .where(eq(invoices.id, id));

    reply.redirect(session.url!);
  });
}

async function recalcInvoiceTotals(db: any, invoiceId: string, tenantId: string) {
  const { taxRates } = await import('@rivertown/db');
  const { ilike } = await import('drizzle-orm');

  const items = await db.select().from(invoiceLineItems)
    .where(and(eq(invoiceLineItems.invoiceId, invoiceId), eq(invoiceLineItems.tenantId, tenantId)));

  let subtotalCents = 0;
  let taxableSubtotalCents = 0;
  for (const item of items) {
    subtotalCents += item.totalCents;
    if (item.taxable !== false) taxableSubtotalCents += item.totalCents;
  }

  // Look up tax rate from customer's billing address
  let taxRate = 0;
  const [invoice] = await db.select({ customerId: invoices.customerId }).from(invoices)
    .where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId))).limit(1);
  if (invoice) {
    const [customer] = await db.select({ state: customers.state, city: customers.city, county: customers.county }).from(customers)
      .where(and(eq(customers.id, invoice.customerId), eq(customers.tenantId, tenantId))).limit(1);
    if (customer?.state) {
      const stateCode = normalizeStateCode(customer.state);

      // Try county match first (most accurate)
      let [rate] = customer.county ? await db.select().from(taxRates)
        .where(and(
          eq(taxRates.tenantId, tenantId),
          eq(taxRates.state, stateCode),
          ilike(taxRates.county, customer.county),
          eq(taxRates.isActive, true),
        )).limit(1) : [undefined];

      // Try city as county fallback
      if (!rate && customer.city) {
        [rate] = await db.select().from(taxRates)
          .where(and(
            eq(taxRates.tenantId, tenantId),
            eq(taxRates.state, stateCode),
            ilike(taxRates.county, customer.city),
            eq(taxRates.isActive, true),
          )).limit(1);
      }

      // Fallback to state default
      if (!rate) {
        [rate] = await db.select().from(taxRates)
          .where(and(
            eq(taxRates.tenantId, tenantId),
            eq(taxRates.state, stateCode),
            sql`${taxRates.county} IS NULL`,
            eq(taxRates.isActive, true),
          )).limit(1);
      }
      if (rate) taxRate = parseFloat(rate.combinedRate);
    }
  }

  const taxCents = Math.round(taxableSubtotalCents * taxRate / 100);
  const totalCents = subtotalCents + taxCents;

  await db.update(invoices).set({
    subtotalCents,
    taxCents,
    totalCents,
    updatedAt: new Date(),
  }).where(and(eq(invoices.id, invoiceId), eq(invoices.tenantId, tenantId)));
}

const STATE_NAMES: Record<string, string> = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC',
};

function normalizeStateCode(state: string): string {
  const s = state.trim();
  if (s.length === 2) return s.toUpperCase();
  return STATE_NAMES[s.toLowerCase()] ?? s.toUpperCase();
}
