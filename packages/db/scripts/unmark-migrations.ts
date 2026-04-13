/**
 * Remove specific migration rows from _migrations so they run on next migrate-all.
 * Used when an earlier --force-record (or this script's predecessor) over-marked.
 */
import postgres from 'postgres';
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
  const toRemove = [
    '0027_saas_tenant_fields.sql',
    '0028_system_configs.sql',
    '0029_case_insensitive_email.sql',
    '0030_onboarding_fields.sql',
    '0031_admin_panel_features.sql',
    '0032_import_fields_and_custom_fields.sql',
    '0033_import_support_all_entities.sql',
  ];
  for (const f of toRemove) {
    await sql`DELETE FROM "_migrations" WHERE filename = ${f}`;
    console.log('unmarked ' + f);
  }
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
