/**
 * Round out Dunder Mifflin's demo data for financial + operational dashboards.
 *   1) Vary unit costs across existing line items so gross margin differs per customer tier
 *   2) Add 3 new open invoices + 1 past-due invoice (past the due date, unpaid)
 *   3) Seed tech time entries on a handful of tickets so labor-cost widgets populate
 *   4) Backfill any remaining tickets that still have null slaPolicyId (fail-safe)
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, isNull, inArray, sql } from 'drizzle-orm';
import {
  tenants, users, customers, tickets, slaPolicies,
  contracts, contractLineItems, invoices, invoiceLineItems, ticketTimeEntries,
} from '@rivertown/db';

const client = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const db = drizzle(client);

async function main() {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.name, 'Dunder Mifflin')).limit(1);
  if (!tenant) { console.error('Tenant not found'); process.exit(1); }

  const [owner] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.role, 'owner')))
    .orderBy(users.createdAt)
    .limit(1);

  const custRows = await db.select().from(customers).where(eq(customers.tenantId, tenant.id));
  const custByExt: Record<string, typeof custRows[number]> = {};
  for (const c of custRows) {
    if (c.externalId) custByExt[c.externalId] = c;
  }

  // ------------ 1) Vary costs per tier so margins differ ------------
  // Margin by tier: bronze=30%, silver=37%, gold=45%, platinum=52% (higher tiers pay more, bigger margin)
  const MARGIN_BY_TIER: Record<string, number> = {
    bronze: 0.30, silver: 0.37, gold: 0.45, platinum: 0.52, prospect: 0.20,
  };

  function costForCustomer(cust: typeof custRows[number], unitPriceCents: number): number {
    const tier = String((cust.customFields as any)?.account_tier ?? 'gold').toLowerCase();
    const margin = MARGIN_BY_TIER[tier] ?? 0.40;
    return Math.round(unitPriceCents * (1 - margin));
  }

  // Update contract line items
  const contractRows = await db.select().from(contracts).where(eq(contracts.tenantId, tenant.id));
  const contractToCust: Record<string, string> = {};
  for (const c of contractRows) contractToCust[c.id] = c.customerId;

  const allContractLines = await db
    .select()
    .from(contractLineItems)
    .where(eq(contractLineItems.tenantId, tenant.id));

  let contractLinesUpdated = 0;
  for (const line of allContractLines) {
    const custId = contractToCust[line.contractId];
    const cust = custRows.find((c) => c.id === custId);
    if (!cust) continue;
    const newCost = costForCustomer(cust, line.unitPriceCents);
    if (line.unitCostCents === newCost) continue;
    await db
      .update(contractLineItems)
      .set({ unitCostCents: newCost, updatedAt: new Date() })
      .where(eq(contractLineItems.id, line.id));
    contractLinesUpdated++;
  }
  console.log(`Updated ${contractLinesUpdated} contract line items with tier-varied costs`);

  // Update invoice line items
  const invRows = await db.select().from(invoices).where(eq(invoices.tenantId, tenant.id));
  const invToCust: Record<string, string> = {};
  for (const i of invRows) invToCust[i.id] = i.customerId;

  const allInvLines = await db
    .select()
    .from(invoiceLineItems)
    .where(eq(invoiceLineItems.tenantId, tenant.id));

  let invLinesUpdated = 0;
  for (const line of allInvLines) {
    const custId = invToCust[line.invoiceId];
    const cust = custRows.find((c) => c.id === custId);
    if (!cust) continue;
    const newCost = costForCustomer(cust, line.unitPriceCents);
    if (line.unitCostCents === newCost) continue;
    await db
      .update(invoiceLineItems)
      .set({ unitCostCents: newCost, updatedAt: new Date() })
      .where(eq(invoiceLineItems.id, line.id));
    invLinesUpdated++;
  }
  console.log(`Updated ${invLinesUpdated} invoice line items with tier-varied costs`);

  // ------------ 2) New invoices: 3 open + 1 past-due ------------
  const [invMax] = await db
    .select({ n: sql<number>`coalesce(max(${invoices.invoiceNumber}), 0)::int` })
    .from(invoices)
    .where(eq(invoices.tenantId, tenant.id));
  let invNum = invMax?.n ?? 0;

  interface NewInvoice {
    custExt: string;
    issueDaysAgo: number;
    dueDaysFromIssue: number;
    status: 'open' | 'past_due';
    desc: string;
    quantity: number;
    unitCents: number;
  }

  const NEW_INVOICES: NewInvoice[] = [
    // Three open (not yet due / recently issued)
    { custExt: 'dm-cust-001', issueDaysAgo: 3,  dueDaysFromIssue: 30, status: 'open', desc: 'Ad-hoc project — office move IT setup', quantity: 18, unitCents: 12500 },
    { custExt: 'dm-cust-003', issueDaysAgo: 10, dueDaysFromIssue: 30, status: 'open', desc: 'Security audit — Q2 2026', quantity: 1, unitCents: 750000 },
    { custExt: 'dm-cust-005', issueDaysAgo: 7,  dueDaysFromIssue: 30, status: 'open', desc: 'Core switch replacement + labor', quantity: 1, unitCents: 185000 },
    // One past-due (issued 45 days ago, due date was 15 days ago)
    { custExt: 'dm-cust-004', issueDaysAgo: 45, dueDaysFromIssue: 30, status: 'past_due', desc: 'Quarterly maintenance — Q1 2026', quantity: 4, unitCents: 22500 },
  ];

  let newInvoicesCreated = 0;
  for (const ni of NEW_INVOICES) {
    const cust = custByExt[ni.custExt];
    if (!cust) continue;
    const issueDate = new Date(Date.now() - ni.issueDaysAgo * 86400 * 1000);
    const dueDate = new Date(issueDate.getTime() + ni.dueDaysFromIssue * 86400 * 1000);

    // Skip if we already seeded this exact invoice
    const existing = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenant.id),
        eq(invoices.customerId, cust.id),
        eq(invoices.issueDate, issueDate.toISOString().slice(0, 10)),
        eq(invoices.totalCents, ni.unitCents * ni.quantity),
      ))
      .limit(1);
    if (existing.length > 0) continue;

    invNum++;
    const total = Math.round(ni.unitCents * ni.quantity);
    const unitCost = costForCustomer(cust, ni.unitCents);

    const [inv] = await db
      .insert(invoices)
      .values({
        tenantId: tenant.id,
        customerId: cust.id,
        invoiceNumber: invNum,
        // Schema only knows 'draft' | 'open' | 'paid' etc. — store past_due status as 'open'
        // and let the due_date show it's late (standard approach)
        status: 'open',
        issueDate: issueDate.toISOString().slice(0, 10),
        dueDate: dueDate.toISOString().slice(0, 10),
        subtotalCents: total,
        totalCents: total,
        amountPaidCents: 0,
        notes: ni.status === 'past_due' ? 'PAST DUE — please remit payment immediately' : null,
      } as any)
      .returning({ id: invoices.id });

    await db.insert(invoiceLineItems).values({
      tenantId: tenant.id,
      invoiceId: inv.id,
      description: ni.desc,
      quantity: String(ni.quantity),
      unitPriceCents: ni.unitCents,
      unitCostCents: unitCost,
      totalCents: total,
    } as any);

    newInvoicesCreated++;
  }
  console.log(`Created ${newInvoicesCreated} new invoices (3 open + 1 past-due)`);

  // ------------ 3) Tech time entries on select tickets ------------
  const allTickets = await db.select().from(tickets).where(eq(tickets.tenantId, tenant.id));
  // Hourly COST rate for the tech (internal cost) — $65/hr
  const techCostCents = 6500;
  // Billable rate on time (what the customer sees) — $175/hr
  const billableRateCents = 17500;

  // Pick a mix — one long + billable, one short + non-billable, a couple medium
  const timeEntryPlans = [
    { filter: (t: typeof allTickets[number]) => t.subject.includes('File server offline'), minutes: 180, billable: true, notes: 'On-site triage, swapped RAID controller, restored services.' },
    { filter: (t: typeof allTickets[number]) => t.subject.includes('Email down'), minutes: 45, billable: true, notes: 'Identified M365 service incident, re-granted shared mailbox permissions.' },
    { filter: (t: typeof allTickets[number]) => t.subject.includes('POS printer'), minutes: 75, billable: true, notes: 'Replaced thermal printer, reconfigured POS drivers.' },
    { filter: (t: typeof allTickets[number]) => t.subject.includes('Laptop running slow'), minutes: 90, billable: true, notes: 'Remote disk cleanup, malware scan, RAM swap recommendation sent.' },
    { filter: (t: typeof allTickets[number]) => t.subject.includes('MFA reset'), minutes: 15, billable: false, notes: 'Included in managed-services retainer.' },
    { filter: (t: typeof allTickets[number]) => t.subject.includes('Slow internet'), minutes: 120, billable: true, notes: 'On-site network diagnostics, replaced core switch.' },
    { filter: (t: typeof allTickets[number]) => t.subject.includes('Replacing WiFi router'), minutes: 210, billable: true, notes: 'On-site install of Unifi U6-Pro + PoE switch, tested coverage.' },
    { filter: (t: typeof allTickets[number]) => t.subject.includes('New hire onboarding'), minutes: 60, billable: true, notes: 'Imaged laptop, created M365 + VPN accounts for Erin Hannon.' },
  ];

  let timeEntriesCreated = 0;
  for (const plan of timeEntryPlans) {
    const ticket = allTickets.find(plan.filter);
    if (!ticket || !owner) continue;

    // Skip if we've already seeded a time entry with the same notes on this ticket
    const existing = await db
      .select({ id: ticketTimeEntries.id })
      .from(ticketTimeEntries)
      .where(and(
        eq(ticketTimeEntries.tenantId, tenant.id),
        eq(ticketTimeEntries.ticketId, ticket.id),
        eq(ticketTimeEntries.notes, plan.notes),
      ))
      .limit(1);
    if (existing.length > 0) continue;

    const endedAt = new Date(ticket.createdAt.getTime() + plan.minutes * 60_000);
    await db.insert(ticketTimeEntries).values({
      tenantId: tenant.id,
      ticketId: ticket.id,
      userId: owner.id,
      startedAt: ticket.createdAt,
      endedAt,
      durationMinutes: plan.minutes,
      isBillable: plan.billable,
      rateCents: plan.billable ? billableRateCents : 0,
      notes: plan.notes,
    } as any);
    timeEntriesCreated++;
  }

  // Quick computed totals for the user
  const totalMinutes = timeEntryPlans.reduce((s, p) => s + p.minutes, 0);
  const billableMinutes = timeEntryPlans.filter((p) => p.billable).reduce((s, p) => s + p.minutes, 0);
  const laborCostCents = Math.round((totalMinutes / 60) * techCostCents);
  const billableRevenueCents = Math.round((billableMinutes / 60) * billableRateCents);
  console.log(
    `Created ${timeEntriesCreated} time entries — ` +
    `${totalMinutes}min total (${billableMinutes}min billable). ` +
    `Labor cost ~$${(laborCostCents / 100).toFixed(2)}, ` +
    `billable revenue ~$${(billableRevenueCents / 100).toFixed(2)}`,
  );

  // ------------ 4) Fail-safe: backfill any tickets still missing SLA ------------
  const orphanedTickets = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), isNull(tickets.slaPolicyId)));

  if (orphanedTickets.length > 0) {
    const policies = await db.select().from(slaPolicies).where(eq(slaPolicies.tenantId, tenant.id));
    const policyById: Record<string, typeof policies[number]> = {};
    for (const p of policies) policyById[p.id] = p;
    const custByIdFresh: Record<string, typeof custRows[number]> = {};
    const refreshedCusts = await db.select().from(customers).where(eq(customers.tenantId, tenant.id));
    for (const c of refreshedCusts) custByIdFresh[c.id] = c;

    let backfilled = 0;
    for (const t of orphanedTickets) {
      const cust = custByIdFresh[t.customerId];
      const slaId = cust?.slaPolicyId;
      if (!slaId) continue;
      const policy = policyById[slaId];
      if (!policy) continue;
      const respMin = policy[`${t.priority}ResponseMinutes` as keyof typeof policy] as number | undefined;
      const resMin = policy[`${t.priority}ResolutionMinutes` as keyof typeof policy] as number | undefined;
      if (respMin == null || resMin == null) continue;
      const base = t.createdAt.getTime();
      const respDue = new Date(base + respMin * 60_000);
      const resDue = new Date(base + resMin * 60_000);
      const resolved = t.resolvedAt ? t.resolvedAt.getTime() : null;
      const breached = resolved == null && Date.now() > resDue.getTime();
      await db
        .update(tickets)
        .set({
          slaPolicyId: slaId,
          slaResponseDueAt: respDue,
          slaResolutionDueAt: resDue,
          slaDueAt: resDue,
          slaResponseMet: resolved != null && resolved <= respDue.getTime() ? true : null,
          slaBreached: breached,
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, t.id));
      backfilled++;
    }
    console.log(`Backfilled SLA on ${backfilled} tickets`);
  }

  void inArray; // unused-import guard

  console.log('\nFinancials + time entries seeded.');
  await client.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
