/**
 * One-off: report which migrations _migrations thinks are applied, whether
 * key tables exist in the DB, and whether the Phase 1/3 columns are present.
 */
import postgres from 'postgres';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('DATABASE_URL not set'); process.exit(1); }
  const sql = postgres(url, { max: 1, ssl: 'prefer' });

  const migrationsExists = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '_migrations') AS ok
  `;
  console.log('_migrations table exists:', migrationsExists[0].ok);

  if (migrationsExists[0].ok) {
    const applied = await sql`SELECT filename FROM "_migrations" ORDER BY filename`;
    console.log(`_migrations rows: ${applied.length}`);
    for (const r of applied) console.log('  ' + r.filename);
  }

  const tenantsExists = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'tenants') AS ok
  `;
  console.log('tenants table exists:', tenantsExists[0].ok);

  const contractsDefaultCol = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'contracts' AND column_name = 'default_labor_line_item_id') AS ok
  `;
  console.log('contracts.default_labor_line_item_id (0034):', contractsDefaultCol[0].ok);

  const linePeriodCol = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'contract_line_items' AND column_name = 'period_start_date') AS ok
  `;
  console.log('contract_line_items.period_start_date (0035):', linePeriodCol[0].ok);

  const coveragePolicyCol = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'contract_line_items' AND column_name = 'coverage_policy') AS ok
  `;
  console.log('contract_line_items.coverage_policy (0034):', coveragePolicyCol[0].ok);

  const timeEntryClassCol = await sql`
    SELECT EXISTS (SELECT 1 FROM information_schema.columns
      WHERE table_name = 'ticket_time_entries' AND column_name = 'classification') AS ok
  `;
  console.log('ticket_time_entries.classification (0034):', timeEntryClassCol[0].ok);

  await sql.end();
}
main().catch(err => { console.error(err); process.exit(1); });
