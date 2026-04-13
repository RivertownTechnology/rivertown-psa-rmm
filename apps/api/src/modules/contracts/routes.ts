import { FastifyInstance } from 'fastify';
import { eq, and, count, desc, sql, gte, inArray } from 'drizzle-orm';
import { contracts, contractLineItems, pax8Subscriptions, ticketTimeEntries, tickets, serviceCatalogItems, serviceCatalogBundles, serviceCatalogBundleItems, users, tenants, customers } from '@rivertown/db';
import { createContractSchema, updateContractSchema, createLineItemSchema, updateLineItemSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';
import { liveBlockBalanceHours } from './billing-logic.js';

function computeLineItemMetrics(item: { unitPriceCents: number; unitCostCents: number | null; quantity: string | null }) {
  const qty = parseFloat(item.quantity ?? '1');
  const revenue = item.unitPriceCents * qty;
  const cost = item.unitCostCents ? item.unitCostCents * qty : null;
  const profit = cost !== null ? revenue - cost : null;
  const marginPercent = cost !== null && revenue > 0 ? ((revenue - cost) / revenue) * 100 : null;
  return { lineTotalRevenueCents: Math.round(revenue), lineTotalCostCents: cost ? Math.round(cost) : null, lineProfitCents: profit ? Math.round(profit) : null, marginPercent: marginPercent ? Math.round(marginPercent * 10) / 10 : null };
}

export async function contractRoutes(fastify: FastifyInstance) {
  // List contracts
  fastify.get('/api/v1/contracts', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const params = request.query as Record<string, string>;
    const { offset, limit } = paginationToOffset(query);
    const conditions = [eq(contracts.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(contracts.customerId, params.customerId));
    if (params.status) conditions.push(eq(contracts.status, params.status));
    const where = and(...conditions);
    const [data, [{ total }]] = await Promise.all([
      fastify.db.select().from(contracts).where(where).limit(limit).offset(offset).orderBy(desc(contracts.createdAt)),
      fastify.db.select({ total: count() }).from(contracts).where(where),
    ]);
    return paginate(data, total, query);
  });

  // Get contract with line items, labor costs, and P&L summary
  fastify.get('/api/v1/contracts/:id', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [contract] = await fastify.db.select().from(contracts)
      .where(and(eq(contracts.id, id), eq(contracts.tenantId, request.tenantId))).limit(1);
    if (!contract) throw new NotFoundError('Contract', id);

    // Get line items
    const lineItems = await fastify.db.select().from(contractLineItems)
      .where(eq(contractLineItems.contractId, id))
      .orderBy(contractLineItems.sortOrder, contractLineItems.createdAt);

    const enrichedItems = lineItems.map(item => ({
      ...item,
      ...computeLineItemMetrics(item),
    }));

    let totalMonthlyRevenueCents = 0;
    let totalMonthlyCostCents = 0;
    let coveredHoursTotal = 0;
    let coveredHoursUsed = 0;

    for (const item of enrichedItems) {
      totalMonthlyRevenueCents += item.lineTotalRevenueCents;
      if (item.lineTotalCostCents !== null) totalMonthlyCostCents += item.lineTotalCostCents;
      if (item.itemType === 'block_time') {
        coveredHoursTotal += parseFloat(item.blockHours ?? '0');
        coveredHoursUsed += parseFloat(item.blockHoursUsed ?? '0');
      }
    }

    // Get ALL time entries for tickets under this contract (labor cost tracking)
    const contractTickets = await fastify.db.select({ id: tickets.id })
      .from(tickets)
      .where(and(eq(tickets.contractId, id), eq(tickets.tenantId, request.tenantId)));

    const ticketIds = contractTickets.map(t => t.id);

    // Get org default rate
    const [tenant] = await fastify.db.select({
      defaultInternalCostCents: tenants.defaultInternalCostCents,
    }).from(tenants).where(eq(tenants.id, request.tenantId)).limit(1);
    const orgDefaultCost = tenant?.defaultInternalCostCents ?? 7500;

    // Build a map of per-tech internal cost rates
    const techUsers = await fastify.db.select({
      id: users.id,
      internalCostCents: users.internalCostCents,
      displayName: users.displayName,
    }).from(users).where(eq(users.tenantId, request.tenantId));
    const techCostMap = new Map<string, number>();
    const techNameMap = new Map<string, string>();
    for (const u of techUsers) {
      techCostMap.set(u.id, u.internalCostCents ?? orgDefaultCost);
      techNameMap.set(u.id, u.displayName);
    }

    let timeEntries: Array<{
      id: string; ticketId: string; userId: string; durationMinutes: number | null;
      isBillable: boolean; rateCents: number | null; notes: string | null;
      startedAt: Date; ticketNumber: number; ticketSubject: string;
      techName: string; techCostCents: number;
    }> = [];
    let totalLaborMinutes = 0;
    let coveredLaborMinutes = 0;
    let billableLaborMinutes = 0;
    let laborCostCents = 0;

    if (ticketIds.length > 0) {
      for (const ticketId of ticketIds) {
        const entries = await fastify.db.select({
          id: ticketTimeEntries.id,
          ticketId: ticketTimeEntries.ticketId,
          userId: ticketTimeEntries.userId,
          durationMinutes: ticketTimeEntries.durationMinutes,
          isBillable: ticketTimeEntries.isBillable,
          rateCents: ticketTimeEntries.rateCents,
          notes: ticketTimeEntries.notes,
          startedAt: ticketTimeEntries.startedAt,
          ticketNumber: tickets.ticketNumber,
          ticketSubject: tickets.subject,
        }).from(ticketTimeEntries)
          .innerJoin(tickets, eq(ticketTimeEntries.ticketId, tickets.id))
          .where(eq(ticketTimeEntries.ticketId, ticketId))
          .orderBy(desc(ticketTimeEntries.startedAt));

        for (const e of entries) {
          const costRate = techCostMap.get(e.userId) ?? orgDefaultCost;
          timeEntries.push({
            ...e,
            techName: techNameMap.get(e.userId) ?? 'Unknown',
            techCostCents: costRate,
          });
        }
      }

      for (const entry of timeEntries) {
        const mins = entry.durationMinutes ?? 0;
        const hours = mins / 60;
        totalLaborMinutes += mins;
        laborCostCents += Math.round(hours * entry.techCostCents);
        if (entry.isBillable) billableLaborMinutes += mins;
        else coveredLaborMinutes += mins;
      }
    }

    const totalLaborHours = totalLaborMinutes / 60;

    // True P&L: Revenue - Product Costs - Labor Costs
    const totalCostCents = totalMonthlyCostCents + laborCostCents;
    const trueProfitCents = totalMonthlyRevenueCents - totalCostCents;
    const trueMarginPercent = totalMonthlyRevenueCents > 0 ? Math.round((trueProfitCents / totalMonthlyRevenueCents) * 1000) / 10 : 0;

    return {
      ...contract,
      lineItems: enrichedItems,
      timeEntries,
      summary: {
        totalMonthlyRevenueCents,
        productCostCents: totalMonthlyCostCents,
        laborCostCents,
        totalCostCents,
        trueProfitCents,
        trueMarginPercent,
        // Legacy fields for backwards compat
        totalMonthlyCostCents: totalCostCents,
        monthlyProfitCents: trueProfitCents,
        marginPercent: trueMarginPercent,
        // Labor breakdown
        totalLaborHours: Math.round(totalLaborHours * 10) / 10,
        coveredLaborHours: Math.round((coveredLaborMinutes / 60) * 10) / 10,
        billableLaborHours: Math.round((billableLaborMinutes / 60) * 10) / 10,
        internalCostPerHourCents: orgDefaultCost,
        // Block time
        coveredHoursTotal,
        coveredHoursUsed,
        coveredHoursRemaining: coveredHoursTotal - coveredHoursUsed,
      },
    };
  });

  // Create contract
  fastify.post('/api/v1/contracts', { preHandler: [fastify.authenticate, requirePermission('contracts:write')] }, async (request, reply) => {
    const body = createContractSchema.parse(request.body);
    const [contract] = await fastify.db.insert(contracts).values({
      tenantId: request.tenantId, customerId: body.customerId, name: body.name,
      contractType: body.contractType, status: body.status, startDate: body.startDate,
      endDate: body.endDate, billingCycle: body.billingCycle, autoRenew: body.autoRenew, notes: body.notes,
    }).returning();
    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'contract.created', entityType: 'contract', entityId: contract.id, ipAddress: request.ip,
    });
    reply.code(201);
    return contract;
  });

  // Update contract
  fastify.patch('/api/v1/contracts/:id', { preHandler: [fastify.authenticate, requirePermission('contracts:write')] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateContractSchema.parse(request.body);
    const [existing] = await fastify.db.select().from(contracts)
      .where(and(eq(contracts.id, id), eq(contracts.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Contract', id);
    const [updated] = await fastify.db.update(contracts).set({ ...body, updatedAt: new Date() })
      .where(and(eq(contracts.id, id), eq(contracts.tenantId, request.tenantId))).returning();
    return updated;
  });

  // Delete contract (and its line items)
  fastify.delete('/api/v1/contracts/:id', { preHandler: [fastify.authenticate, requirePermission('contracts:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [existing] = await fastify.db.select().from(contracts)
      .where(and(eq(contracts.id, id), eq(contracts.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Contract', id);
    // Unlink any pax8 subscriptions referencing line items in this contract
    const lineItemIds = await fastify.db.select({ id: contractLineItems.id }).from(contractLineItems).where(eq(contractLineItems.contractId, id));
    for (const li of lineItemIds) {
      await fastify.db.update(pax8Subscriptions).set({ contractLineItemId: null, updatedAt: new Date() })
        .where(eq(pax8Subscriptions.contractLineItemId, li.id));
    }
    await fastify.db.delete(contractLineItems).where(eq(contractLineItems.contractId, id));
    await fastify.db.delete(contracts).where(and(eq(contracts.id, id), eq(contracts.tenantId, request.tenantId)));
    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'contract.deleted', entityType: 'contract', entityId: id, ipAddress: request.ip,
    });
    reply.code(204).send();
  });

  // List line items
  fastify.get('/api/v1/contracts/:id/line-items', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const items = await fastify.db.select().from(contractLineItems)
      .where(and(eq(contractLineItems.contractId, id), eq(contractLineItems.tenantId, request.tenantId)))
      .orderBy(contractLineItems.sortOrder, contractLineItems.createdAt);
    return items.map(item => ({ ...item, ...computeLineItemMetrics(item) }));
  });

  // Add line item (enhanced with cost/category)
  fastify.post('/api/v1/contracts/:id/line-items', { preHandler: [fastify.authenticate, requirePermission('contracts:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = createLineItemSchema.parse(request.body);
    const [item] = await fastify.db.insert(contractLineItems).values({
      tenantId: request.tenantId, contractId: id,
      description: body.description, itemType: body.itemType, category: body.category,
      unitPriceCents: body.unitPriceCents, unitCostCents: body.unitCostCents,
      quantity: body.quantity, blockHours: body.blockHours, taxable: body.taxable,
      sortOrder: body.sortOrder,
    }).returning();
    reply.code(201);
    return { ...item, ...computeLineItemMetrics(item) };
  });

  // Update line item
  fastify.patch('/api/v1/contracts/:id/line-items/:lineId', { preHandler: [fastify.authenticate, requirePermission('contracts:write')] }, async (request) => {
    const { id, lineId } = request.params as { id: string; lineId: string };
    const body = updateLineItemSchema.parse(request.body);
    const [existing] = await fastify.db.select().from(contractLineItems)
      .where(and(eq(contractLineItems.id, lineId), eq(contractLineItems.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Line item', lineId);
    const [updated] = await fastify.db.update(contractLineItems).set({ ...body, updatedAt: new Date() })
      .where(and(eq(contractLineItems.id, lineId), eq(contractLineItems.tenantId, request.tenantId))).returning();
    return { ...updated, ...computeLineItemMetrics(updated) };
  });

  // Delete line item
  fastify.delete('/api/v1/contracts/:id/line-items/:lineId', { preHandler: [fastify.authenticate, requirePermission('contracts:write')] }, async (request, reply) => {
    const { lineId } = request.params as { id: string; lineId: string };
    // Unlink any pax8 subscription referencing this line item before deleting
    await fastify.db.update(pax8Subscriptions).set({ contractLineItemId: null, updatedAt: new Date() })
      .where(eq(pax8Subscriptions.contractLineItemId, lineId));
    await fastify.db.delete(contractLineItems)
      .where(and(eq(contractLineItems.id, lineId), eq(contractLineItems.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // Add from service catalog
  fastify.post('/api/v1/contracts/:id/add-from-catalog', { preHandler: [fastify.authenticate, requirePermission('contracts:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { catalogItemId, bundleId, quantity } = request.body as { catalogItemId?: string; bundleId?: string; quantity?: string };
    const qty = quantity ?? '1';

    if (catalogItemId) {
      const [catalogItem] = await fastify.db.select().from(serviceCatalogItems)
        .where(and(eq(serviceCatalogItems.id, catalogItemId), eq(serviceCatalogItems.tenantId, request.tenantId))).limit(1);
      if (!catalogItem) throw new NotFoundError('Catalog item', catalogItemId);

      const [item] = await fastify.db.insert(contractLineItems).values({
        tenantId: request.tenantId, contractId: id,
        description: catalogItem.name, itemType: catalogItem.itemType, category: catalogItem.category,
        unitPriceCents: catalogItem.defaultUnitPriceCents, unitCostCents: catalogItem.defaultUnitCostCents,
        quantity: qty, blockHours: catalogItem.defaultBlockHours, taxable: true,
      }).returning();
      reply.code(201);
      return [{ ...item, ...computeLineItemMetrics(item) }];
    }

    if (bundleId) {
      const [bundle] = await fastify.db.select().from(serviceCatalogBundles)
        .where(and(eq(serviceCatalogBundles.id, bundleId), eq(serviceCatalogBundles.tenantId, request.tenantId))).limit(1);
      if (!bundle) throw new NotFoundError('Bundle', bundleId);

      const bundleItems = await fastify.db.select({
        catalogItem: serviceCatalogItems,
        multiplier: serviceCatalogBundleItems.quantityMultiplier,
        sortOrder: serviceCatalogBundleItems.sortOrder,
      }).from(serviceCatalogBundleItems)
        .innerJoin(serviceCatalogItems, eq(serviceCatalogBundleItems.catalogItemId, serviceCatalogItems.id))
        .where(eq(serviceCatalogBundleItems.bundleId, bundleId))
        .orderBy(serviceCatalogBundleItems.sortOrder);

      const created = [];
      for (const bi of bundleItems) {
        const ci = bi.catalogItem;
        const effectiveQty = (parseFloat(qty) * parseFloat(bi.multiplier ?? '1')).toString();
        const [item] = await fastify.db.insert(contractLineItems).values({
          tenantId: request.tenantId, contractId: id,
          description: ci.name, itemType: ci.itemType, category: ci.category,
          unitPriceCents: ci.defaultUnitPriceCents, unitCostCents: ci.defaultUnitCostCents,
          quantity: effectiveQty, blockHours: ci.defaultBlockHours, taxable: true,
          sortOrder: bi.sortOrder ?? 0,
        }).returning();
        created.push({ ...item, ...computeLineItemMetrics(item) });
      }
      reply.code(201);
      return created;
    }

    throw new Error('Either catalogItemId or bundleId is required');
  });

  // Sync Pax8 costs for this contract
  fastify.post('/api/v1/contracts/:id/sync-pax8', { preHandler: [fastify.authenticate, requirePermission('contracts:write')] }, async (request) => {
    const { id } = request.params as { id: string };
    const lineItems = await fastify.db.select().from(contractLineItems)
      .where(and(eq(contractLineItems.contractId, id), eq(contractLineItems.tenantId, request.tenantId)));

    let synced = 0;
    for (const item of lineItems) {
      if (!item.pax8SubscriptionId) continue;
      const [pax8Sub] = await fastify.db.select().from(pax8Subscriptions)
        .where(eq(pax8Subscriptions.pax8SubscriptionId, item.pax8SubscriptionId)).limit(1);
      if (!pax8Sub) continue;

      await fastify.db.update(contractLineItems).set({
        unitCostCents: pax8Sub.unitPriceCents ? parseInt(pax8Sub.unitPriceCents, 10) : undefined,
        quantity: pax8Sub.quantity ?? undefined,
        updatedAt: new Date(),
      }).where(eq(contractLineItems.id, item.id));
      synced++;
    }
    return { synced };
  });

  // Block-hour burn report — every active block line with live usage, period,
  // expiry, and the last-30-day hours signal for humans to eyeball burn rate.
  fastify.get(
    '/api/v1/reports/block-hours',
    { preHandler: [fastify.authenticate, requirePermission('contracts:read')] },
    async (request) => {
      // All block lines under active contracts
      const lines = await fastify.db
        .select({
          lineItemId: contractLineItems.id,
          description: contractLineItems.description,
          blockHours: contractLineItems.blockHours,
          warnAtPct: contractLineItems.warnAtPct,
          periodStartDate: contractLineItems.periodStartDate,
          resetCadence: contractLineItems.resetCadence,
          expiresAt: contractLineItems.expiresAt,
          overageRateCents: contractLineItems.overageRateCents,
          contractId: contracts.id,
          contractName: contracts.name,
          contractStatus: contracts.status,
          customerId: contracts.customerId,
          customerName: customers.name,
        })
        .from(contractLineItems)
        .innerJoin(contracts, eq(contractLineItems.contractId, contracts.id))
        .innerJoin(customers, eq(contracts.customerId, customers.id))
        .where(
          and(
            eq(contractLineItems.tenantId, request.tenantId),
            eq(contractLineItems.coveragePolicy, 'block'),
            eq(contracts.status, 'active'),
          ),
        );

      if (lines.length === 0) return { rows: [] };

      // Last-30-day usage per line, one aggregate query
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - 30);
      const lineIds = lines.map((l) => l.lineItemId);
      const last30 = await fastify.db
        .select({
          lineItemId: ticketTimeEntries.contractLineItemId,
          minutes: sql<number>`COALESCE(SUM(${ticketTimeEntries.durationMinutes}), 0)`.as('minutes'),
        })
        .from(ticketTimeEntries)
        .where(
          and(
            eq(ticketTimeEntries.tenantId, request.tenantId),
            inArray(ticketTimeEntries.contractLineItemId, lineIds),
            sql`${ticketTimeEntries.classification} IN ('covered', 'overage')`,
            sql`${ticketTimeEntries.nonBillableReason} IS NULL`,
            gte(ticketTimeEntries.startedAt, since),
          ),
        )
        .groupBy(ticketTimeEntries.contractLineItemId);
      const last30ByLine = new Map<string, number>();
      for (const row of last30) {
        if (row.lineItemId) last30ByLine.set(row.lineItemId, Number(row.minutes));
      }

      const rows = [];
      for (const l of lines) {
        const totalHours = parseFloat(l.blockHours ?? '0');
        const remainingHours = await liveBlockBalanceHours(fastify.db as any, {
          id: l.lineItemId,
          blockHours: l.blockHours,
          tenantId: request.tenantId,
          periodStartDate: l.periodStartDate ?? null,
        });
        const usedHours = totalHours - remainingHours;
        const pctUsed = totalHours > 0 ? Math.round((usedHours / totalHours) * 100) : 0;
        const last30Hours = (last30ByLine.get(l.lineItemId) ?? 0) / 60;
        const nearThreshold = pctUsed >= (l.warnAtPct ?? 80);
        rows.push({
          lineItemId: l.lineItemId,
          description: l.description,
          contractId: l.contractId,
          contractName: l.contractName,
          customerId: l.customerId,
          customerName: l.customerName,
          totalHours,
          usedHours: Number(usedHours.toFixed(2)),
          remainingHours: Number(remainingHours.toFixed(2)),
          pctUsed,
          resetCadence: l.resetCadence,
          periodStartDate: l.periodStartDate,
          expiresAt: l.expiresAt,
          overageRateCents: l.overageRateCents,
          last30DaysHours: Number(last30Hours.toFixed(2)),
          nearThreshold,
        });
      }

      // Worst-first: least remaining, then soonest expiry.
      rows.sort((a, b) => {
        if (a.remainingHours !== b.remainingHours) return a.remainingHours - b.remainingHours;
        if (a.expiresAt && b.expiresAt) return new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime();
        return 0;
      });

      return { rows };
    },
  );
}
