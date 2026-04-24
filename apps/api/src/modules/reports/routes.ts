import { FastifyInstance } from 'fastify';
import { eq, and, sql, count, gte, lte, desc, inArray } from 'drizzle-orm';
import { tickets, ticketTimeEntries, users, customers, contracts, contractLineItems, invoices, csatRatings, assets, tenants } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { ValidationError } from '../../common/errors.js';

export async function reportRoutes(fastify: FastifyInstance) {
  // Ticket volume over time
  fastify.get('/api/v1/reports/ticket-volume', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const conditions: any[] = [eq(tickets.tenantId, request.tenantId)];
    if (startDate) conditions.push(gte(tickets.createdAt, new Date(startDate)));
    if (endDate) {
      // Add 1 day to include tickets created on the end date
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lte(tickets.createdAt, end));
    }

    // Use Drizzle query instead of raw SQL for reliability
    const allTickets = await fastify.db.select({
      createdAt: tickets.createdAt,
    }).from(tickets).where(and(...conditions));

    // Group by day in JS
    const dayMap = new Map<string, number>();
    for (const t of allTickets) {
      const day = new Date(t.createdAt).toISOString().split('T')[0];
      dayMap.set(day, (dayMap.get(day) ?? 0) + 1);
    }

    return Array.from(dayMap.entries())
      .map(([day, count]) => ({ day, count }))
      .sort((a, b) => a.day.localeCompare(b.day));
  });

  // SLA compliance
  fastify.get('/api/v1/reports/sla-compliance', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const conditions: any[] = [
      eq(tickets.tenantId, request.tenantId),
      sql`${tickets.status} IN ('resolved', 'closed')`,
    ];
    if (startDate) conditions.push(gte(tickets.createdAt, new Date(startDate)));
    if (endDate) {
      const end = new Date(endDate);
      end.setDate(end.getDate() + 1);
      conditions.push(lte(tickets.createdAt, end));
    }

    const where = and(...conditions);

    const [metRows] = await fastify.db.select({ count: count() }).from(tickets)
      .where(and(where!, eq(tickets.slaBreached, false)));
    const [breachedRows] = await fastify.db.select({ count: count() }).from(tickets)
      .where(and(where!, eq(tickets.slaBreached, true)));

    const met = metRows?.count ?? 0;
    const breached = breachedRows?.count ?? 0;
    const total = met + breached;

    return {
      met,
      breached,
      total,
      compliancePercent: total > 0 ? Math.round((met / total) * 1000) / 10 : 100,
    };
  });

  // Tech utilization
  fastify.get('/api/v1/reports/tech-utilization', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const conditions: any[] = [eq(ticketTimeEntries.tenantId, request.tenantId)];
    if (startDate) conditions.push(gte(ticketTimeEntries.startedAt, new Date(startDate)));
    if (endDate) conditions.push(lte(ticketTimeEntries.startedAt, new Date(endDate)));

    const rows = await fastify.db
      .select({
        userId: ticketTimeEntries.userId,
        displayName: users.displayName,
        totalMinutes: sql<number>`COALESCE(SUM(${ticketTimeEntries.durationMinutes}), 0)::int`,
        entryCount: count(),
      })
      .from(ticketTimeEntries)
      .innerJoin(users, eq(ticketTimeEntries.userId, users.id))
      .where(and(...conditions))
      .groupBy(ticketTimeEntries.userId, users.displayName)
      .orderBy(desc(sql`SUM(${ticketTimeEntries.durationMinutes})`));

    return rows.map(r => ({
      ...r,
      totalHours: Math.round((r.totalMinutes / 60) * 10) / 10,
    }));
  });

  // Revenue by customer
  fastify.get('/api/v1/reports/revenue-by-customer', {
    preHandler: [fastify.authenticate, requirePermission('invoices:read')]
  }, async (request) => {
    const rows = await fastify.db
      .select({
        customerId: contracts.customerId,
        customerName: customers.name,
        totalRevenueCents: sql<number>`COALESCE(SUM(${contractLineItems.unitPriceCents} * COALESCE(${contractLineItems.quantity}::numeric, 1)), 0)::int`,
        totalCostCents: sql<number>`COALESCE(SUM(COALESCE(${contractLineItems.unitCostCents}, 0) * COALESCE(${contractLineItems.quantity}::numeric, 1)), 0)::int`,
      })
      .from(contractLineItems)
      .innerJoin(contracts, eq(contractLineItems.contractId, contracts.id))
      .innerJoin(customers, eq(contracts.customerId, customers.id))
      .where(and(eq(contracts.tenantId, request.tenantId), eq(contracts.status, 'active')))
      .groupBy(contracts.customerId, customers.name)
      .orderBy(desc(sql`SUM(${contractLineItems.unitPriceCents} * COALESCE(${contractLineItems.quantity}::numeric, 1))`));

    return rows.map(r => ({
      ...r,
      marginCents: r.totalRevenueCents - r.totalCostCents,
      marginPercent: r.totalRevenueCents > 0
        ? Math.round(((r.totalRevenueCents - r.totalCostCents) / r.totalRevenueCents) * 1000) / 10
        : 0,
    }));
  });

  // Time summary
  fastify.get('/api/v1/reports/time-summary', {
    preHandler: [fastify.authenticate, requirePermission('time-entries:write')]
  }, async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const conditions: any[] = [eq(ticketTimeEntries.tenantId, request.tenantId)];
    if (startDate) conditions.push(gte(ticketTimeEntries.startedAt, new Date(startDate)));
    if (endDate) conditions.push(lte(ticketTimeEntries.startedAt, new Date(endDate)));

    const rows = await fastify.db
      .select({
        day: sql<string>`date_trunc('day', ${ticketTimeEntries.startedAt})`,
        userId: ticketTimeEntries.userId,
        displayName: users.displayName,
        customerId: tickets.customerId,
        customerName: customers.name,
        totalMinutes: sql<number>`COALESCE(SUM(${ticketTimeEntries.durationMinutes}), 0)::int`,
        billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${ticketTimeEntries.isBillable} THEN ${ticketTimeEntries.durationMinutes} ELSE 0 END), 0)::int`,
      })
      .from(ticketTimeEntries)
      .innerJoin(users, eq(ticketTimeEntries.userId, users.id))
      .innerJoin(tickets, eq(ticketTimeEntries.ticketId, tickets.id))
      .innerJoin(customers, eq(tickets.customerId, customers.id))
      .where(and(...conditions))
      .groupBy(
        sql`date_trunc('day', ${ticketTimeEntries.startedAt})`,
        ticketTimeEntries.userId,
        users.displayName,
        tickets.customerId,
        customers.name,
      )
      .orderBy(desc(sql`date_trunc('day', ${ticketTimeEntries.startedAt})`));

    return rows;
  });

  // Invoice aging
  fastify.get('/api/v1/reports/invoice-aging', {
    preHandler: [fastify.authenticate, requirePermission('invoices:read')]
  }, async (request) => {
    const openInvoices = await fastify.db
      .select({
        id: invoices.id,
        invoiceNumber: invoices.invoiceNumber,
        customerId: invoices.customerId,
        customerName: customers.name,
        totalCents: invoices.totalCents,
        amountPaidCents: invoices.amountPaidCents,
        dueDate: invoices.dueDate,
        status: invoices.status,
      })
      .from(invoices)
      .innerJoin(customers, eq(invoices.customerId, customers.id))
      .where(and(
        eq(invoices.tenantId, request.tenantId),
        sql`${invoices.status} IN ('sent', 'partial', 'overdue')`,
      ))
      .orderBy(invoices.dueDate);

    const now = new Date();
    const buckets = { current: [] as any[], '1_30': [] as any[], '31_60': [] as any[], '61_90': [] as any[], '90_plus': [] as any[] };

    for (const inv of openInvoices) {
      const due = new Date(inv.dueDate);
      const daysOverdue = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24));
      const outstandingCents = inv.totalCents - inv.amountPaidCents;
      const item = { ...inv, daysOverdue, outstandingCents };

      if (daysOverdue <= 0) buckets.current.push(item);
      else if (daysOverdue <= 30) buckets['1_30'].push(item);
      else if (daysOverdue <= 60) buckets['31_60'].push(item);
      else if (daysOverdue <= 90) buckets['61_90'].push(item);
      else buckets['90_plus'].push(item);
    }

    const sumBucket = (items: any[]) => items.reduce((s, i) => s + i.outstandingCents, 0);

    return {
      buckets,
      summary: {
        currentCents: sumBucket(buckets.current),
        '1_30_cents': sumBucket(buckets['1_30']),
        '31_60_cents': sumBucket(buckets['31_60']),
        '61_90_cents': sumBucket(buckets['61_90']),
        '90_plus_cents': sumBucket(buckets['90_plus']),
        totalOutstandingCents: sumBucket(openInvoices.map(i => ({ outstandingCents: i.totalCents - i.amountPaidCents }))),
      },
    };
  });

  // CSAT summary report
  fastify.get('/api/v1/reports/csat', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const { startDate, endDate } = request.query as { startDate?: string; endDate?: string };
    const conditions: any[] = [eq(csatRatings.tenantId, request.tenantId)];
    if (startDate) conditions.push(gte(csatRatings.createdAt, new Date(startDate)));
    if (endDate) conditions.push(lte(csatRatings.createdAt, new Date(endDate)));

    // Only count rated entries (rating is not null and > 0)
    conditions.push(sql`${csatRatings.rating} IS NOT NULL AND ${csatRatings.rating} > 0`);

    const ratings = await fastify.db.select({
      rating: csatRatings.rating,
      count: count(),
    }).from(csatRatings).where(and(...conditions)).groupBy(csatRatings.rating);

    const happy = ratings.find(r => r.rating === 3)?.count ?? 0;
    const neutral = ratings.find(r => r.rating === 2)?.count ?? 0;
    const unhappy = ratings.find(r => r.rating === 1)?.count ?? 0;
    const total = happy + neutral + unhappy;

    return {
      happy, neutral, unhappy, total,
      satisfactionPercent: total > 0 ? Math.round((happy / total) * 1000) / 10 : 0,
    };
  });

  // Executive Summary Report
  fastify.get('/api/v1/reports/executive-summary', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const { customerId, startDate, endDate } = request.query as { customerId: string; startDate: string; endDate: string };
    if (!customerId || !startDate || !endDate) throw new ValidationError('customerId, startDate, and endDate are required');

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setDate(end.getDate() + 1); // Include end date

    // Customer info
    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, request.tenantId))).limit(1);
    if (!customer) throw new ValidationError('Customer not found');

    // Tickets in period
    const periodTickets = await fastify.db.select()
      .from(tickets)
      .where(and(
        eq(tickets.tenantId, request.tenantId),
        eq(tickets.customerId, customerId),
        gte(tickets.createdAt, start),
        lte(tickets.createdAt, end),
      ));

    const totalTickets = periodTickets.length;
    const resolvedTickets = periodTickets.filter(t => ['resolved', 'closed'].includes(t.status));
    const openTickets = periodTickets.filter(t => !['resolved', 'closed'].includes(t.status));
    const criticalTickets = periodTickets.filter(t => t.priority === 'critical');
    const highTickets = periodTickets.filter(t => t.priority === 'high');

    // SLA performance
    const slaTracked = resolvedTickets.filter(t => t.slaBreached !== null);
    const slaMet = slaTracked.filter(t => !t.slaBreached).length;
    const slaBreached = slaTracked.filter(t => t.slaBreached).length;
    const slaCompliance = slaTracked.length > 0 ? Math.round((slaMet / slaTracked.length) * 1000) / 10 : 100;

    // Average resolution time (for resolved tickets)
    const resolutionTimes = resolvedTickets
      .filter(t => t.resolvedAt && t.createdAt)
      .map(t => (new Date(t.resolvedAt!).getTime() - new Date(t.createdAt).getTime()) / 3600000); // hours
    const avgResolutionHours = resolutionTimes.length > 0
      ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
      : 0;

    // Time entries
    const ticketIds = periodTickets.map(t => t.id);
    let totalLaborMinutes = 0;
    let billableMinutes = 0;
    if (ticketIds.length > 0) {
      const allEntries = await fastify.db.select({ durationMinutes: ticketTimeEntries.durationMinutes, isBillable: ticketTimeEntries.isBillable, ticketId: ticketTimeEntries.ticketId })
        .from(ticketTimeEntries).where(inArray(ticketTimeEntries.ticketId, ticketIds));
      for (const e of allEntries) {
        totalLaborMinutes += e.durationMinutes ?? 0;
        if (e.isBillable) billableMinutes += e.durationMinutes ?? 0;
      }
    }

    // Contracts
    const activeContracts = await fastify.db.select({ id: contracts.id, name: contracts.name, contractType: contracts.contractType })
      .from(contracts)
      .where(and(eq(contracts.tenantId, request.tenantId), eq(contracts.customerId, customerId), eq(contracts.status, 'active')));

    // Assets
    const customerAssets = await fastify.db.select({ id: assets.id, name: assets.name, assetType: assets.assetType, screenconnectOnline: assets.screenconnectOnline })
      .from(assets)
      .where(and(eq(assets.tenantId, request.tenantId), eq(assets.customerId, customerId)));
    const onlineAssets = customerAssets.filter(a => a.screenconnectOnline).length;

    // CSAT
    let csatHappy = 0, csatNeutral = 0, csatUnhappy = 0;
    if (ticketIds.length > 0) {
      const allRatings = await fastify.db.select({ rating: csatRatings.rating })
        .from(csatRatings).where(and(inArray(csatRatings.ticketId, ticketIds), sql`${csatRatings.rating} IS NOT NULL AND ${csatRatings.rating} > 0`));
      for (const r of allRatings) {
        if (r.rating === 3) csatHappy++;
        else if (r.rating === 2) csatNeutral++;
        else if (r.rating === 1) csatUnhappy++;
      }
    }
    const csatTotal = csatHappy + csatNeutral + csatUnhappy;
    const csatScore = csatTotal > 0 ? Math.round((csatHappy / csatTotal) * 1000) / 10 : null;

    // Ticket breakdown by source
    const categoryBreakdown: Record<string, number> = {};
    for (const t of periodTickets) {
      const cat = t.source || 'manual';
      categoryBreakdown[cat] = (categoryBreakdown[cat] ?? 0) + 1;
    }

    // Ticket breakdown by priority
    const priorityBreakdown: Record<string, number> = {};
    for (const t of periodTickets) {
      priorityBreakdown[t.priority] = (priorityBreakdown[t.priority] ?? 0) + 1;
    }

    // Top tickets by time spent
    const allTimeByTicket = await fastify.db.select({
      ticketId: ticketTimeEntries.ticketId,
      totalMinutes: sql<number>`COALESCE(SUM(${ticketTimeEntries.durationMinutes}), 0)::int`,
    }).from(ticketTimeEntries).where(inArray(ticketTimeEntries.ticketId, ticketIds.slice(0, 50)))
      .groupBy(ticketTimeEntries.ticketId);
    const minutesByTicket = new Map(allTimeByTicket.map(r => [r.ticketId, r.totalMinutes]));
    const topTickets = periodTickets.map(t => ({
      ticketNumber: t.ticketNumber, subject: t.subject, status: t.status,
      minutesSpent: minutesByTicket.get(t.id) ?? 0,
    })).sort((a, b) => b.minutesSpent - a.minutesSpent);

    // Report template settings
    const [tenant] = await fastify.db.select({ settings: tenants.settings }).from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const tenantSettings = (tenant?.settings ?? {}) as Record<string, unknown>;

    return {
      customer: { name: customer.name, email: customer.billingEmail },
      period: { startDate, endDate },
      template: {
        primaryColor: tenantSettings.reportPrimaryColor ?? '#2563eb',
        accentColor: tenantSettings.reportAccentColor ?? '#3b82f6',
        logoUrl: tenantSettings.reportLogoUrl ?? '',
        companyName: tenantSettings.reportCompanyName ?? '',
        footerText: tenantSettings.reportFooterText ?? '',
      },
      tickets: {
        total: totalTickets,
        resolved: resolvedTickets.length,
        open: openTickets.length,
        critical: criticalTickets.length,
        high: highTickets.length,
        avgResolutionHours,
        priorityBreakdown,
        sourceBreakdown: categoryBreakdown,
        topByTime: topTickets.slice(0, 10),
      },
      sla: { tracked: slaTracked.length, met: slaMet, breached: slaBreached, compliance: slaCompliance },
      labor: {
        totalHours: Math.round((totalLaborMinutes / 60) * 10) / 10,
        billableHours: Math.round((billableMinutes / 60) * 10) / 10,
        nonBillableHours: Math.round(((totalLaborMinutes - billableMinutes) / 60) * 10) / 10,
      },
      contracts: activeContracts.map(c => ({ name: c.name, type: c.contractType })),
      assets: { total: customerAssets.length, online: onlineAssets, types: customerAssets.reduce((acc: Record<string, number>, a) => { acc[a.assetType] = (acc[a.assetType] ?? 0) + 1; return acc; }, {}) },
      csat: { happy: csatHappy, neutral: csatNeutral, unhappy: csatUnhappy, total: csatTotal, score: csatScore },
    };
  });
}
