/**
 * Seed test data into the Kylers Service Team tenant, renaming it to "Dunder Mifflin".
 * Idempotent: running multiple times updates the tenant name but does NOT duplicate customers
 * (uses external_id as the dedup key via our unique index).
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, sql } from 'drizzle-orm';
import {
  tenants, users, customers, contacts, tickets, tenantSequences,
  contracts, contractLineItems, invoices, invoiceLineItems,
} from '@rivertown/db';

const client = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const db = drizzle(client);

async function main() {
  // 1) Find the tenant — by current name (post-rename) or original
  const found = await db
    .select()
    .from(tenants)
    .where(sql`name IN ('Kylers Service Team', 'Dunder Mifflin')`)
    .limit(1);
  const tenant = found[0];

  if (!tenant) {
    console.error('No matching tenant found. Aborting.');
    process.exit(1);
  }

  // 2) Rename to Dunder Mifflin (idempotent)
  await db
    .update(tenants)
    .set({ name: 'Dunder Mifflin', slug: 'dunder-mifflin', updatedAt: new Date() })
    .where(eq(tenants.id, tenant.id));
  console.log(`Tenant ${tenant.id} ensured as "Dunder Mifflin"`);

  // Grab the owner user — tickets get assigned to them
  const [owner] = await db
    .select()
    .from(users)
    .where(and(eq(users.tenantId, tenant.id), eq(users.role, 'owner')))
    .orderBy(users.createdAt)
    .limit(1);
  if (!owner) { console.error('No owner found'); process.exit(1); }

  // 3) Seed customers — fun Scranton-area clients for the paper company's IT services ;)
  const CUSTOMERS = [
    {
      extId: 'dm-cust-001',
      name: 'Vance Refrigeration',
      customerType: 'commercial',
      phone: '(570) 555-0101',
      address: '100 Industrial Park Dr',
      city: 'Scranton',
      state: 'PA',
      zip: '18503',
      billingEmail: 'bob@vancerefrigeration.com',
      website: 'https://vancerefrigeration.com',
      customFields: { territory: 'Northeast', account_tier: 'gold', primary_tech: 'Jim Halpert' },
    },
    {
      extId: 'dm-cust-002',
      name: 'Schrute Farms B&B',
      customerType: 'commercial',
      phone: '(570) 555-0205',
      address: '1725 Beet Farm Rd',
      city: 'Honesdale',
      state: 'PA',
      zip: '18431',
      billingEmail: 'dwight@schrutefarms.com',
      website: 'https://schrutefarms.com',
      customFields: { territory: 'Northeast', account_tier: 'silver', primary_tech: 'Pam Beesly' },
    },
    {
      extId: 'dm-cust-003',
      name: 'Lackawanna County',
      customerType: 'commercial',
      phone: '(570) 555-0300',
      address: '200 Adams Ave',
      city: 'Scranton',
      state: 'PA',
      zip: '18503',
      billingEmail: 'ap@lackawannacounty.gov',
      website: 'https://lackawannacounty.gov',
      customFields: { territory: 'Northeast', account_tier: 'platinum', primary_tech: 'Jim Halpert' },
    },
    {
      extId: 'dm-cust-004',
      name: 'Poor Richard\'s Pub',
      customerType: 'commercial',
      phone: '(570) 555-0404',
      address: '125 Beech St',
      city: 'Scranton',
      state: 'PA',
      zip: '18510',
      billingEmail: 'richard@poorrichardspub.com',
      customFields: { territory: 'Northeast', account_tier: 'bronze', primary_tech: 'Kevin Malone' },
    },
    {
      extId: 'dm-cust-005',
      name: 'Scranton Business Park',
      customerType: 'commercial',
      phone: '(570) 555-0500',
      address: '1725 Slough Ave',
      city: 'Scranton',
      state: 'PA',
      zip: '18505',
      billingEmail: 'billing@scrantonbusinesspark.com',
      customFields: { territory: 'Northeast', account_tier: 'gold', primary_tech: 'Andy Bernard' },
    },
    {
      extId: 'dm-cust-006',
      name: 'Prince Family Paper',
      customerType: 'lead',
      status: 'lead',
      phone: '(570) 555-0601',
      city: 'Scranton',
      state: 'PA',
      customFields: { territory: 'Northeast', account_tier: 'prospect', primary_tech: 'Michael Scott' },
    },
  ];

  const customerIdByExt: Record<string, string> = {};
  for (const c of CUSTOMERS) {
    // Check-then-insert — the partial unique index on external_id can't be used for ON CONFLICT
    const existing = await db
      .select({ id: customers.id })
      .from(customers)
      .where(and(
        eq(customers.tenantId, tenant.id),
        eq(customers.externalSource, 'seed'),
        eq(customers.externalId, c.extId),
      ))
      .limit(1);
    if (existing.length > 0) {
      customerIdByExt[c.extId] = existing[0].id;
      continue;
    }
    const [row] = await db
      .insert(customers)
      .values({
        tenantId: tenant.id,
        name: c.name,
        status: c.status ?? 'active',
        customerType: c.customerType,
        phone: c.phone,
        address: c.address,
        city: c.city,
        state: c.state,
        zip: c.zip,
        billingEmail: c.billingEmail,
        website: c.website,
        externalId: c.extId,
        externalSource: 'seed',
        customFields: c.customFields,
      })
      .returning({ id: customers.id });
    customerIdByExt[c.extId] = row.id;
  }
  console.log(`Seeded/verified ${CUSTOMERS.length} customers`);

  // 4) Contacts — one primary per customer
  const CONTACTS = [
    { custExt: 'dm-cust-001', first: 'Bob', last: 'Vance', email: 'bob@vancerefrigeration.com', phone: '(570) 555-0101', title: 'Owner', dept: 'Vance Refrigeration' },
    { custExt: 'dm-cust-002', first: 'Dwight', last: 'Schrute', email: 'dwight@schrutefarms.com', phone: '(570) 555-0205', title: 'Assistant (to the) Regional Manager', dept: 'Operations' },
    { custExt: 'dm-cust-002', first: 'Mose', last: 'Schrute', email: 'mose@schrutefarms.com', phone: '(570) 555-0206', title: 'Farmhand', dept: 'Operations' },
    { custExt: 'dm-cust-003', first: 'Holly', last: 'Flax', email: 'holly.flax@lackawannacounty.gov', phone: '(570) 555-0301', title: 'HR Director', dept: 'Human Resources' },
    { custExt: 'dm-cust-004', first: 'Richard', last: 'Sbarra', email: 'richard@poorrichardspub.com', phone: '(570) 555-0404', title: 'General Manager', dept: 'Management' },
    { custExt: 'dm-cust-005', first: 'David', last: 'Wallace', email: 'dwallace@scrantonbusinesspark.com', phone: '(570) 555-0501', title: 'CFO', dept: 'Finance' },
  ];

  let contactsCreated = 0;
  for (const c of CONTACTS) {
    const customerId = customerIdByExt[c.custExt];
    if (!customerId) continue;
    // Skip if email already exists for this customer
    const existing = await db
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(
        eq(contacts.tenantId, tenant.id),
        eq(contacts.customerId, customerId),
        eq(contacts.email, c.email),
      ))
      .limit(1);
    if (existing.length > 0) continue;

    await db.insert(contacts).values({
      tenantId: tenant.id,
      customerId,
      firstName: c.first,
      lastName: c.last,
      email: c.email,
      phone: c.phone,
      jobTitle: c.title,
      department: c.dept,
      isPrimary: true,
    });
    contactsCreated++;
  }
  console.log(`Seeded ${contactsCreated} contacts`);

  // 5) Bump the ticket sequence and create tickets
  // Start ticket numbering past whatever exists — robust against prior partial seeds
  const [ticketMax] = await db
    .select({ n: sql<number>`coalesce(max(${tickets.ticketNumber}), 0)::int` })
    .from(tickets)
    .where(eq(tickets.tenantId, tenant.id));
  let ticketNum = ticketMax?.n ?? 0;

  const now = Date.now();
  const hoursAgo = (h: number) => new Date(now - h * 3600 * 1000);
  const daysAgo = (d: number) => new Date(now - d * 86400 * 1000);

  const TICKETS = [
    { custExt: 'dm-cust-001', subject: 'Email down — can\'t access shared mailbox', description: 'Bob says no one in the office can see the shared "invoices@" inbox. Started around 9am.', status: 'open', priority: 'high', createdAt: hoursAgo(2) },
    { custExt: 'dm-cust-001', subject: 'Laptop running slow — please schedule cleanup', description: 'Accounting PC has been crawling for a week. Needs disk cleanup + malware scan.', status: 'new', priority: 'medium', createdAt: hoursAgo(6) },
    { custExt: 'dm-cust-002', subject: 'Replacing WiFi router at farmhouse', description: 'Old router finally died. Shipping a Unifi U6-Pro + PoE switch. On-site visit needed.', status: 'scheduled', priority: 'medium', createdAt: daysAgo(1) },
    { custExt: 'dm-cust-002', subject: 'MFA reset for Dwight', description: 'Dwight lost his phone (again). Need to reset MFA on M365 tenant.', status: 'resolved', priority: 'low', createdAt: daysAgo(3), resolvedAt: daysAgo(2) },
    { custExt: 'dm-cust-003', subject: 'CRITICAL: File server offline', description: 'Main file server in the courthouse is not responding. Multiple departments affected. On-site tech dispatched.', status: 'open', priority: 'critical', createdAt: hoursAgo(1) },
    { custExt: 'dm-cust-003', subject: 'Annual security audit scheduled for next month', description: 'Prep work — inventory of all endpoints, compliance check, patch audit.', status: 'new', priority: 'low', createdAt: daysAgo(2) },
    { custExt: 'dm-cust-004', subject: 'POS printer not printing receipts', description: 'Epson thermal printer at the bar has been dead since yesterday. Swapping in a spare.', status: 'in_progress', priority: 'medium', createdAt: hoursAgo(18) },
    { custExt: 'dm-cust-005', subject: 'Slow internet across all tenants', description: 'ISP reports no issues on their end. Likely internal. Swapping core switch tonight.', status: 'open', priority: 'high', createdAt: hoursAgo(4) },
    { custExt: 'dm-cust-005', subject: 'Quarterly backup review — all clean', description: 'Routine check-in, all 12 sites backing up nightly, retention healthy.', status: 'resolved', priority: 'low', createdAt: daysAgo(7), resolvedAt: daysAgo(6) },
    { custExt: 'dm-cust-001', subject: 'New hire onboarding — account + laptop for Erin Hannon', description: 'Starts Monday. Need M365 account, laptop imaged, VPN access.', status: 'closed', priority: 'medium', createdAt: daysAgo(14), resolvedAt: daysAgo(12), closedAt: daysAgo(10) },
  ];

  let ticketsCreated = 0;
  for (const t of TICKETS) {
    const customerId = customerIdByExt[t.custExt];
    if (!customerId) continue;
    // Skip if a ticket with the same subject already exists for this customer
    const existing = await db
      .select({ id: tickets.id })
      .from(tickets)
      .where(and(
        eq(tickets.tenantId, tenant.id),
        eq(tickets.customerId, customerId),
        eq(tickets.subject, t.subject),
      ))
      .limit(1);
    if (existing.length > 0) continue;

    ticketNum++;
    await db.insert(tickets).values({
      tenantId: tenant.id,
      customerId,
      ticketNumber: ticketNum,
      subject: t.subject,
      description: t.description,
      status: t.status,
      priority: t.priority,
      assignedTo: owner.id,
      createdAt: t.createdAt,
      updatedAt: t.createdAt,
      resolvedAt: (t as any).resolvedAt ?? null,
      closedAt: (t as any).closedAt ?? null,
    });
    ticketsCreated++;
  }
  await db
    .update(tenantSequences)
    .set({ currentValue: String(ticketNum) })
    .where(and(eq(tenantSequences.tenantId, tenant.id), eq(tenantSequences.sequenceName, 'ticket')));
  console.log(`Seeded ${ticketsCreated} tickets, ticket counter now at ${ticketNum}`);

  // 6) Contracts — recurring managed-services contracts
  const CONTRACTS = [
    { custExt: 'dm-cust-001', name: 'Vance Refrigeration — Managed IT', contractType: 'managed_services', monthlyAmount: 125000, lineDesc: 'Full-service managed IT — 12 users', quantity: 12, unitCents: 10000 },
    { custExt: 'dm-cust-002', name: 'Schrute Farms — Break/Fix Support', contractType: 'break_fix', monthlyAmount: 75000, lineDesc: 'On-call support + quarterly on-site', quantity: 1, unitCents: 75000 },
    { custExt: 'dm-cust-003', name: 'Lackawanna County — Enterprise Support', contractType: 'managed_services', monthlyAmount: 580000, lineDesc: 'Premium managed IT — 45 users + 3 sites', quantity: 45, unitCents: 12000 },
    { custExt: 'dm-cust-005', name: 'Scranton Business Park — Per-User', contractType: 'managed_services', monthlyAmount: 340000, lineDesc: 'Building-wide managed IT — 28 users', quantity: 28, unitCents: 12000 },
  ];

  const contractIdByExt: Record<string, string> = {};
  let contractsCreated = 0;
  for (const c of CONTRACTS) {
    const customerId = customerIdByExt[c.custExt];
    if (!customerId) continue;

    // Skip if a contract with the same name already exists on this customer
    const existing = await db
      .select({ id: contracts.id })
      .from(contracts)
      .where(and(
        eq(contracts.tenantId, tenant.id),
        eq(contracts.customerId, customerId),
        eq(contracts.name, c.name),
      ))
      .limit(1);
    if (existing.length > 0) {
      contractIdByExt[c.custExt] = existing[0].id;
      continue;
    }

    const startDate = new Date(Date.now() - 180 * 86400 * 1000); // 6 months ago
    const [contract] = await db
      .insert(contracts)
      .values({
        tenantId: tenant.id,
        customerId,
        name: c.name,
        contractType: c.contractType,
        status: 'active',
        startDate: startDate.toISOString().slice(0, 10),
        endDate: new Date(startDate.getTime() + 365 * 86400 * 1000).toISOString().slice(0, 10),
        billingCycle: 'monthly',
        autoRenew: true,
      })
      .returning({ id: contracts.id });

    await db.insert(contractLineItems).values({
      tenantId: tenant.id,
      contractId: contract.id,
      description: c.lineDesc,
      itemType: 'recurring',
      unitPriceCents: c.unitCents,
      unitCostCents: Math.round(c.unitCents * 0.6), // 40% gross margin — realistic for managed services
      quantity: String(c.quantity),
    } as any);

    contractIdByExt[c.custExt] = contract.id;
    contractsCreated++;
  }
  console.log(`Seeded ${contractsCreated} contracts`);

  // 7) Invoices — recent invoices, some paid, some open
  const [invMax] = await db
    .select({ n: sql<number>`coalesce(max(${invoices.invoiceNumber}), 0)::int` })
    .from(invoices)
    .where(eq(invoices.tenantId, tenant.id));
  let invNum = invMax?.n ?? 0;

  const INVOICES = [
    { custExt: 'dm-cust-001', daysAgo: 30, status: 'paid',  amountCents: 125000, desc: 'Managed IT — March 2026', quantity: 12, unit: 10000 },
    { custExt: 'dm-cust-001', daysAgo: 0,  status: 'open',  amountCents: 125000, desc: 'Managed IT — April 2026', quantity: 12, unit: 10000 },
    { custExt: 'dm-cust-002', daysAgo: 30, status: 'paid',  amountCents: 75000,  desc: 'Break/Fix retainer — March 2026', quantity: 1, unit: 75000 },
    { custExt: 'dm-cust-002', daysAgo: 0,  status: 'open',  amountCents: 75000,  desc: 'Break/Fix retainer — April 2026', quantity: 1, unit: 75000 },
    { custExt: 'dm-cust-003', daysAgo: 30, status: 'paid',  amountCents: 580000, desc: 'Enterprise Support — March 2026', quantity: 45, unit: 12000 },
    { custExt: 'dm-cust-003', daysAgo: 0,  status: 'open',  amountCents: 580000, desc: 'Enterprise Support — April 2026', quantity: 45, unit: 12000 },
    { custExt: 'dm-cust-004', daysAgo: 45, status: 'open',  amountCents: 24500,  desc: 'Emergency dispatch — POS printer replacement', quantity: 2.5, unit: 9800 },
    { custExt: 'dm-cust-005', daysAgo: 30, status: 'paid',  amountCents: 340000, desc: 'Per-User Managed IT — March 2026', quantity: 28, unit: 12000 },
  ];

  let invoicesCreated = 0;
  for (const i of INVOICES) {
    const customerId = customerIdByExt[i.custExt];
    if (!customerId) continue;
    // Skip if we already seeded this exact invoice (same customer + same description in notes)
    const issueDate = new Date(Date.now() - i.daysAgo * 86400 * 1000);
    const existing = await db
      .select({ id: invoices.id })
      .from(invoices)
      .where(and(
        eq(invoices.tenantId, tenant.id),
        eq(invoices.customerId, customerId),
        eq(invoices.issueDate, issueDate.toISOString().slice(0, 10)),
        eq(invoices.totalCents, i.amountCents),
      ))
      .limit(1);
    if (existing.length > 0) continue;

    invNum++;
    const dueDate = new Date(issueDate.getTime() + 30 * 86400 * 1000);

    const [inv] = await db
      .insert(invoices)
      .values({
        tenantId: tenant.id,
        customerId,
        invoiceNumber: invNum,
        status: i.status,
        issueDate: issueDate.toISOString().slice(0, 10),
        dueDate: dueDate.toISOString().slice(0, 10),
        subtotalCents: i.amountCents,
        totalCents: i.amountCents,
        amountPaidCents: i.status === 'paid' ? i.amountCents : 0,
      } as any)
      .returning({ id: invoices.id });

    await db.insert(invoiceLineItems).values({
      tenantId: tenant.id,
      invoiceId: inv.id,
      description: i.desc,
      quantity: String(i.quantity),
      unitPriceCents: i.unit,
      unitCostCents: Math.round(i.unit * 0.6), // 40% gross margin
      totalCents: Math.round(i.unit * i.quantity),
    } as any);

    invoicesCreated++;
  }
  await db
    .update(tenantSequences)
    .set({ currentValue: String(invNum) })
    .where(and(eq(tenantSequences.tenantId, tenant.id), eq(tenantSequences.sequenceName, 'invoice')));
  console.log(`Seeded ${invoicesCreated} invoices, invoice counter now at ${invNum}`);

  // Quiet unused-import for sql
  void sql;

  console.log('\nDone. Tenant is now Dunder Mifflin with realistic demo data.');
  await client.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
