/**
 * Add tiered SLA policies (Bronze/Silver/Gold/Platinum) to Dunder Mifflin and
 * assign each customer to the SLA matching their custom_fields.account_tier.
 * Then backfill every existing ticket's SLA fields based on its customer + priority.
 *
 * Idempotent: SLA policies are matched by name; customers/tickets are only updated
 * if they don't already have a policy assigned.
 */
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, isNull, sql } from 'drizzle-orm';
import { tenants, slaPolicies, customers, tickets } from '@rivertown/db';

const client = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const db = drizzle(client);

async function main() {
  const [tenant] = await db
    .select()
    .from(tenants)
    .where(eq(tenants.name, 'Dunder Mifflin'))
    .limit(1);
  if (!tenant) { console.error('Tenant "Dunder Mifflin" not found'); process.exit(1); }

  // ---------- SLA tiers ----------
  // All times in MINUTES. Gold replaces the default "Standard" for the demo.
  const TIERS: Array<{
    name: string;
    description: string;
    isDefault: boolean;
    critResp: number; critRes: number;
    highResp: number; highRes: number;
    medResp: number;  medRes: number;
    lowResp: number;  lowRes: number;
  }> = [
    {
      name: 'Bronze',
      description: 'Best-effort support during business hours. For break/fix and ad-hoc engagements.',
      isDefault: false,
      critResp: 120, critRes: 480,   // 2h / 8h
      highResp: 480, highRes: 960,   // 8h / 16h
      medResp:  960, medRes: 2880,   // 16h / 48h
      lowResp: 2880, lowRes: 5760,   // 48h / 96h
    },
    {
      name: 'Silver',
      description: 'Standard managed-services SLA. Business hours, same-day response on criticals.',
      isDefault: false,
      critResp: 60,  critRes: 240,   // 1h / 4h
      highResp: 240, highRes: 480,   // 4h / 8h
      medResp:  480, medRes: 1440,   // 8h / 24h
      lowResp: 1440, lowRes: 2880,   // 24h / 48h
    },
    {
      name: 'Gold',
      description: 'Premium response. Default for most managed clients. After-hours coverage on criticals.',
      isDefault: true,
      critResp: 30,  critRes: 120,   // 30m / 2h
      highResp: 60,  highRes: 240,   // 1h / 4h
      medResp:  240, medRes: 480,    // 4h / 8h
      lowResp:  480, lowRes: 1440,   // 8h / 24h
    },
    {
      name: 'Platinum',
      description: '24×7 enterprise SLA. Rapid response. For mission-critical + compliance-sensitive clients.',
      isDefault: false,
      critResp: 15,  critRes: 60,    // 15m / 1h
      highResp: 30,  highRes: 120,   // 30m / 2h
      medResp:  120, medRes: 240,    // 2h / 4h
      lowResp:  240, lowRes: 480,    // 4h / 8h
    },
  ];

  // If our auto-seeded "Standard"/"Premium" exist from signup, demote them to non-default
  // and keep them around (don't delete — existing data may reference them).
  await db
    .update(slaPolicies)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(and(
      eq(slaPolicies.tenantId, tenant.id),
      sql`${slaPolicies.name} IN ('Standard', 'Premium')`,
    ));

  const slaIdByName: Record<string, string> = {};
  for (const t of TIERS) {
    const [existing] = await db
      .select({ id: slaPolicies.id })
      .from(slaPolicies)
      .where(and(eq(slaPolicies.tenantId, tenant.id), eq(slaPolicies.name, t.name)))
      .limit(1);
    if (existing) {
      slaIdByName[t.name] = existing.id;
      // Keep definitions current in case we tweaked times
      await db
        .update(slaPolicies)
        .set({
          description: t.description,
          isDefault: t.isDefault,
          criticalResponseMinutes: t.critResp,
          criticalResolutionMinutes: t.critRes,
          highResponseMinutes: t.highResp,
          highResolutionMinutes: t.highRes,
          mediumResponseMinutes: t.medResp,
          mediumResolutionMinutes: t.medRes,
          lowResponseMinutes: t.lowResp,
          lowResolutionMinutes: t.lowRes,
          updatedAt: new Date(),
        })
        .where(eq(slaPolicies.id, existing.id));
    } else {
      const [created] = await db
        .insert(slaPolicies)
        .values({
          tenantId: tenant.id,
          name: t.name,
          description: t.description,
          isDefault: t.isDefault,
          criticalResponseMinutes: t.critResp,
          criticalResolutionMinutes: t.critRes,
          highResponseMinutes: t.highResp,
          highResolutionMinutes: t.highRes,
          mediumResponseMinutes: t.medResp,
          mediumResolutionMinutes: t.medRes,
          lowResponseMinutes: t.lowResp,
          lowResolutionMinutes: t.lowRes,
        })
        .returning({ id: slaPolicies.id });
      slaIdByName[t.name] = created.id;
    }
  }
  console.log(`SLA tiers ready: ${Object.keys(slaIdByName).join(', ')}`);

  // ---------- Assign each customer to the SLA matching their account_tier ----------
  const TIER_TO_SLA: Record<string, string> = {
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum',
    prospect: 'Bronze', // leads get best-effort
  };

  const custRows = await db
    .select()
    .from(customers)
    .where(eq(customers.tenantId, tenant.id));

  let assigned = 0;
  for (const c of custRows) {
    const cf = (c.customFields ?? {}) as Record<string, unknown>;
    const tier = String(cf.account_tier ?? '').toLowerCase();
    const slaName = TIER_TO_SLA[tier] ?? 'Gold';
    const slaId = slaIdByName[slaName];
    if (!slaId) continue;
    if (c.slaPolicyId === slaId) continue;
    await db
      .update(customers)
      .set({ slaPolicyId: slaId, updatedAt: new Date() })
      .where(eq(customers.id, c.id));
    assigned++;
  }
  console.log(`Assigned SLA to ${assigned} customers`);

  // ---------- Backfill ticket SLA fields ----------
  // Re-fetch customers so we see the slaPolicyId we just assigned
  const custsWithSla = await db.select().from(customers).where(eq(customers.tenantId, tenant.id));
  const policies = await db.select().from(slaPolicies).where(eq(slaPolicies.tenantId, tenant.id));
  const policyById: Record<string, typeof policies[number]> = {};
  for (const p of policies) policyById[p.id] = p;

  const custById: Record<string, typeof custsWithSla[number]> = {};
  for (const c of custsWithSla) custById[c.id] = c;

  const allTickets = await db
    .select()
    .from(tickets)
    .where(and(eq(tickets.tenantId, tenant.id), isNull(tickets.slaPolicyId)));

  let ticketsUpdated = 0;
  for (const t of allTickets) {
    const cust = custById[t.customerId];
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
    const now = Date.now();

    // SLA-met logic: if resolved/closed, set responseMet=true if resolution was before the response-due date
    const resolved = t.resolvedAt ? t.resolvedAt.getTime() : null;
    const responseMet = resolved != null && resolved <= respDue.getTime() ? true : null;
    const breached = resolved == null && now > resDue.getTime();

    await db
      .update(tickets)
      .set({
        slaPolicyId: slaId,
        slaResponseDueAt: respDue,
        slaResolutionDueAt: resDue,
        slaDueAt: resDue,
        slaResponseMet: responseMet,
        slaBreached: breached,
        updatedAt: new Date(),
      })
      .where(eq(tickets.id, t.id));
    ticketsUpdated++;
  }
  console.log(`Updated SLA fields on ${ticketsUpdated} tickets`);

  console.log('\nSLA seeding complete.');
  await client.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
