import postgres from 'postgres';
import { hash } from 'bcryptjs';

const email = process.argv[2];
const password = process.argv[3];
const displayName = process.argv[4] ?? email;

if (!email || !password) {
  console.error('Usage: tsx create-super-admin.ts <email> <password> [displayName]');
  process.exit(1);
}

const sql = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });

// Attach to the most recently created tenant — super-admin access is platform-wide
// so tenant membership is irrelevant for the /admin features.
const [tenant] = await sql<{ id: string; name: string }[]>`
  SELECT id, name FROM tenants ORDER BY created_at DESC LIMIT 1
`;

if (!tenant) {
  console.error('No tenants exist yet. Sign up a tenant first, then re-run this.');
  process.exit(1);
}

const existing = await sql<{ id: string }[]>`
  SELECT id FROM users WHERE lower(email) = lower(${email}) LIMIT 1
`;

const passwordHash = await hash(password, 12);

if (existing.length > 0) {
  await sql`
    UPDATE users
    SET password_hash = ${passwordHash},
        is_super_admin = true,
        is_active = true,
        role = 'owner',
        display_name = ${displayName},
        updated_at = NOW()
    WHERE id = ${existing[0].id}
  `;
  console.log(`Updated existing user ${email} → super_admin, password reset.`);
} else {
  await sql`
    INSERT INTO users (tenant_id, email, password_hash, display_name, role, is_active, is_super_admin)
    VALUES (${tenant.id}, ${email.toLowerCase()}, ${passwordHash}, ${displayName}, 'owner', true, true)
  `;
  console.log(`Created user ${email} on tenant "${tenant.name}" → super_admin.`);
}

await sql.end();
