/**
 * Inspect prod to figure out how far migrations actually ran, by testing for
 * columns/tables added by specific migrations.
 */
import postgres from 'postgres';
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
  async function colExists(table: string, col: string): Promise<boolean> {
    const r = await sql`SELECT 1 FROM information_schema.columns WHERE table_name=${table} AND column_name=${col}`;
    return r.length > 0;
  }
  async function tblExists(t: string): Promise<boolean> {
    const r = await sql`SELECT 1 FROM information_schema.tables WHERE table_name=${t}`;
    return r.length > 0;
  }
  const checks: Array<[string, Promise<boolean>]> = [
    ['0027 saas tenant fields (tenants.subscription_status)',   colExists('tenants', 'subscription_status')],
    ['0028 system_configs table',                                tblExists('system_configs')],
    ['0029 case-insensitive email (users.email citext?)',        colExists('users', 'email')],
    ['0030 onboarding (tenants.company_type)',                   colExists('tenants', 'company_type')],
    ['0031 admin panel (tenants.feature_flags)',                 colExists('tenants', 'feature_flags')],
    ['0032 import_jobs table',                                   tblExists('import_jobs')],
    ['0032 customers.custom_fields',                             colExists('customers', 'custom_fields')],
    ['0032 customers.customer_type',                             colExists('customers', 'customer_type')],
    ['0033 contacts.external_id',                                colExists('contacts', 'external_id')],
    ['0033 tenant_lookup_values',                                tblExists('tenant_lookup_values')],
  ];
  for (const [label, p] of checks) {
    console.log((await p ? '✓' : '✗') + ' ' + label);
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
