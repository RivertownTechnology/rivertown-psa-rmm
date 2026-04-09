import { createDb } from '../client.js';
import { ticketCategories, ticketSubcategories } from '../schema/index.js';
import { TICKET_CATEGORY_SEED } from './ticket-categories.js';

async function seedCategories() {
  const databaseUrl =
    process.env.DATABASE_URL || 'postgresql://rivertown:rivertown@localhost:5432/rivertown';
  const db = createDb(databaseUrl);

  const tenantId = process.env.TENANT_ID || '679b00c6-b28f-45ad-a68f-0fb825f7db62';

  console.log(`Seeding ticket categories for tenant ${tenantId}...`);

  let catOrder = 0;
  for (const cat of TICKET_CATEGORY_SEED) {
    const [created] = await db
      .insert(ticketCategories)
      .values({
        tenantId,
        name: cat.name,
        slug: cat.slug,
        description: cat.description,
        sortOrder: catOrder++,
      })
      .returning();

    let subOrder = 0;
    for (const sub of cat.subcategories) {
      await db.insert(ticketSubcategories).values({
        tenantId,
        categoryId: created.id,
        name: sub.name,
        slug: sub.slug,
        description: sub.description,
        sortOrder: subOrder++,
      });
    }

    console.log(`  ${cat.name}: ${cat.subcategories.length} subcategories`);
  }

  console.log('Ticket categories seeded!');
  process.exit(0);
}

seedCategories().catch((err) => {
  console.error('Category seed failed:', err);
  process.exit(1);
});
