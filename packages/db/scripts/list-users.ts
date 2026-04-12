import postgres from 'postgres';
const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const users = await sql<{ id: string; email: string; display_name: string; is_super_admin: boolean }[]>`
  SELECT id, email, display_name, is_super_admin FROM users ORDER BY created_at
`;
console.log('All users:');
for (const u of users) {
  console.log(`  ${u.email}  super=${u.is_super_admin}  name="${u.display_name}"`);
}
await sql.end();
