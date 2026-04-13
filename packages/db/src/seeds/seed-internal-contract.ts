/**
 * Seed the per-tenant "Internal" customer + "Internal Operations" contract +
 * "Overhead" inclusive line item.
 *
 * Every time entry must attach to a contract — overhead time (admin, training,
 * sales, R&D, PTO) lands here so the margin reports stay honest. Time entries
 * that the migration left orphaned (classification='internal', contract_id=NULL)
 * are repointed at the Internal contract here.
 *
 * This is idempotent. Safe to call:
 *   - once during bootstrap for every existing tenant
 *   - on every new tenant creation
 */
import { eq, and, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  customers,
  contracts,
  contractLineItems,
  ticketTimeEntries,
  tenants,
} from '../schema/index.js';

const INTERNAL_CUSTOMER_NAME = 'Internal';
const INTERNAL_CONTRACT_NAME = 'Internal Operations';
const INTERNAL_LINE_DESCRIPTION = 'Overhead';

export interface InternalContractRefs {
  customerId: string;
  contractId: string;
  lineItemId: string;
}

export async function ensureInternalContract(
  db: Database,
  tenantId: string,
): Promise<InternalContractRefs> {
  // 1. Customer
  let [customer] = await db
    .select({ id: customers.id })
    .from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.name, INTERNAL_CUSTOMER_NAME)))
    .limit(1);

  if (!customer) {
    [customer] = await db
      .insert(customers)
      .values({
        tenantId,
        name: INTERNAL_CUSTOMER_NAME,
        status: 'active',
        customerType: 'commercial',
        notes: 'System-managed customer for internal/overhead time. Do not edit or delete.',
      })
      .returning({ id: customers.id });
  }

  // 2. Contract
  let [contract] = await db
    .select({ id: contracts.id, defaultLaborLineItemId: contracts.defaultLaborLineItemId })
    .from(contracts)
    .where(and(eq(contracts.tenantId, tenantId), eq(contracts.customerId, customer.id), eq(contracts.name, INTERNAL_CONTRACT_NAME)))
    .limit(1);

  if (!contract) {
    const [created] = await db
      .insert(contracts)
      .values({
        tenantId,
        customerId: customer.id,
        name: INTERNAL_CONTRACT_NAME,
        contractType: 'managed_services',
        status: 'active',
        startDate: new Date().toISOString().slice(0, 10),
        billingCycle: 'monthly',
        autoRenew: true,
        notes: 'System-managed contract for internal/overhead time tracking.',
      })
      .returning({ id: contracts.id, defaultLaborLineItemId: contracts.defaultLaborLineItemId });
    contract = created;
  }

  // 3. Line item
  let [line] = await db
    .select({ id: contractLineItems.id })
    .from(contractLineItems)
    .where(and(eq(contractLineItems.tenantId, tenantId), eq(contractLineItems.contractId, contract.id), eq(contractLineItems.description, INTERNAL_LINE_DESCRIPTION)))
    .limit(1);

  if (!line) {
    [line] = await db
      .insert(contractLineItems)
      .values({
        tenantId,
        contractId: contract.id,
        description: INTERNAL_LINE_DESCRIPTION,
        itemType: 'recurring',
        coveragePolicy: 'inclusive',
        unitPriceCents: 0,
        unitCostCents: 0,
        quantity: '1',
        category: 'other',
        taxable: false,
        sortOrder: 0,
      })
      .returning({ id: contractLineItems.id });
  }

  // 4. Wire defaultLaborLineItemId on the Internal contract
  if (!contract.defaultLaborLineItemId) {
    await db
      .update(contracts)
      .set({ defaultLaborLineItemId: line.id, updatedAt: new Date() })
      .where(eq(contracts.id, contract.id));
  }

  // 5. Repoint orphan internal time entries (migration left these with NULL contract_id)
  await db
    .update(ticketTimeEntries)
    .set({
      contractId: contract.id,
      contractLineItemId: line.id,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(ticketTimeEntries.tenantId, tenantId),
        eq(ticketTimeEntries.classification, 'internal'),
        isNull(ticketTimeEntries.contractId),
      ),
    );

  return { customerId: customer.id, contractId: contract.id, lineItemId: line.id };
}

/**
 * Bootstrap: run ensureInternalContract for every existing tenant.
 * Use this once after migration 0034 lands.
 */
export async function ensureInternalContractForAllTenants(db: Database): Promise<void> {
  const rows = await db.select({ id: tenants.id, name: tenants.name }).from(tenants);
  for (const t of rows) {
    const refs = await ensureInternalContract(db, t.id);
    // eslint-disable-next-line no-console
    console.log(`  ${t.name}: internal contract ${refs.contractId}`);
  }
}

// CLI entrypoint: `tsx src/seeds/seed-internal-contract.ts`
if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}`) {
  const { createDb } = await import('../client.js');
  const url = process.env.DATABASE_URL || 'postgresql://rivertown:rivertown@localhost:5432/rivertown';
  const db = createDb(url);
  // eslint-disable-next-line no-console
  console.log('Seeding Internal contract for all tenants...');
  await ensureInternalContractForAllTenants(db);
  // eslint-disable-next-line no-console
  console.log('Done.');
  process.exit(0);
}

