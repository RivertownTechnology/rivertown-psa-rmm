import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const rows = await sql<{ name: string; feature_flags: Record<string, unknown> }[]>`
  UPDATE tenants
  SET feature_flags = feature_flags || '{"data_import": true}'::jsonb
  WHERE name = 'Kylers Service Team'
  RETURNING name, feature_flags
`;
console.log('Updated tenants:');
for (const r of rows) console.log('  ' + r.name + '  flags=' + JSON.stringify(r.feature_flags));
await sql.end();
