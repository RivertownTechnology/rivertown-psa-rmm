import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const tables = await sql<{ tablename: string }[]>`
  select tablename from pg_tables where schemaname = 'public' order by tablename
`;
console.log(`Tables (${tables.length}):`);
console.log(tables.map((t) => t.tablename).join(', '));
await sql.end();
