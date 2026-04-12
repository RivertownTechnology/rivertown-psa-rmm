import postgres from 'postgres';

const email = process.argv[2];
if (!email) {
  console.error('Usage: tsx promote-super-admin.ts <email>');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const result = await sql<{ email: string; is_super_admin: boolean }[]>`
  UPDATE users
  SET is_super_admin = true, updated_at = NOW()
  WHERE lower(email) = lower(${email})
  RETURNING email, is_super_admin
`;

if (result.length === 0) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}
console.log(`Promoted ${result[0].email} → is_super_admin=${result[0].is_super_admin}`);
await sql.end();
