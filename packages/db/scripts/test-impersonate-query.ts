import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, and, inArray } from 'drizzle-orm';
import { users } from '@rivertown/db';

const client = postgres(process.env.DATABASE_URL!, { max: 1, ssl: 'prefer' });
const db = drizzle(client);

const tenantId = 'd35afbb7-6ed0-4fb6-8f0b-b6b5ab915838';

const rows = await db
  .select({ id: users.id, tenantId: users.tenantId, role: users.role, email: users.email, isActive: users.isActive })
  .from(users)
  .where(and(
    eq(users.tenantId, tenantId),
    eq(users.isActive, true),
    inArray(users.role, ['owner', 'admin']),
  ))
  .orderBy(users.createdAt)
  .limit(5);

console.log(`Found ${rows.length} users:`);
for (const r of rows) console.log(r);

await client.end();
