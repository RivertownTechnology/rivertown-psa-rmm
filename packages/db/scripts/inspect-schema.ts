import postgres from 'postgres';
async function main() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
  const cols = await sql`SELECT column_name FROM information_schema.columns WHERE table_name='customers' ORDER BY column_name`;
  console.log('customers columns (' + cols.length + '):');
  for (const c of cols) console.log('  ' + c.column_name);
  const tbls = await sql`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`;
  console.log('\ntables (' + tbls.length + '):');
  for (const t of tbls) console.log('  ' + t.table_name);
  await sql.end();
}
main().catch(e => { console.error(e); process.exit(1); });
