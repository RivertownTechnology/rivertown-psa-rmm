import { createDb } from '../client.js';
import { users } from '../schema/index.js';
import { eq } from 'drizzle-orm';

const db = createDb(process.env.DATABASE_URL || '');
const [u] = await db.update(users)
  .set({ email: 'blake@rivertowntechnology.com', displayName: 'Blake Turner' })
  .where(eq(users.email, 'admin@rivertown.local'))
  .returning();
console.log('Updated:', u?.email || 'not found (may already be updated)');
process.exit(0);
