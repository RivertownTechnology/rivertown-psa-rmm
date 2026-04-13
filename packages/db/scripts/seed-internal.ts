/**
 * One-shot: seed the per-tenant Internal contract for every existing tenant.
 * Idempotent — safe to re-run.
 */
import { createDb } from '../src/client.js';
import { ensureInternalContractForAllTenants } from '../src/seeds/seed-internal-contract.js';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const db = createDb(url);
  console.log('Seeding Internal contract for all tenants...');
  await ensureInternalContractForAllTenants(db);
  console.log('Done.');
  process.exit(0);
}
main().catch(err => { console.error(err); process.exit(1); });
