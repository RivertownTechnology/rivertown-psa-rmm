import { createDb } from '../client.js';
import { tenants, users, tenantSequences } from '../schema/index.js';
import { hash } from 'bcryptjs';
import { ensureInternalContract } from './seed-internal-contract.js';

async function seed() {
  const databaseUrl =
    process.env.DATABASE_URL || 'postgresql://rivertown:rivertown@localhost:5432/rivertown';
  const db = createDb(databaseUrl);

  console.log('Seeding database...');

  // Create default tenant
  const [tenant] = await db
    .insert(tenants)
    .values({
      name: 'Rivertown MSP',
      slug: 'rivertown',
      settings: {},
      subscriptionTier: 'professional',
    })
    .returning();

  console.log(`Created tenant: ${tenant.name} (${tenant.id})`);

  // Create admin user
  const passwordHash = await hash('admin123!', 12);
  const [admin] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: 'admin@rivertown.local',
      passwordHash,
      displayName: 'Admin User',
      role: 'owner',
    })
    .returning();

  console.log(`Created admin user: ${admin.email}`);

  // Create a tech user
  const techHash = await hash('tech123!', 12);
  const [tech] = await db
    .insert(users)
    .values({
      tenantId: tenant.id,
      email: 'tech@rivertown.local',
      passwordHash: techHash,
      displayName: 'Tech User',
      role: 'tech',
    })
    .returning();

  console.log(`Created tech user: ${tech.email}`);

  // Initialize sequences
  await db.insert(tenantSequences).values([
    { tenantId: tenant.id, sequenceName: 'ticket', currentValue: '0' },
    { tenantId: tenant.id, sequenceName: 'invoice', currentValue: '0' },
    { tenantId: tenant.id, sequenceName: 'quote', currentValue: '0' },
  ]);

  console.log('Initialized tenant sequences');

  // Internal contract — every tenant needs one so overhead time has somewhere to land.
  const refs = await ensureInternalContract(db, tenant.id);
  console.log(`Created Internal contract: ${refs.contractId}`);

  console.log('Seed complete!');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
