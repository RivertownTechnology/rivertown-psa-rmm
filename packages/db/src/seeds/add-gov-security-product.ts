import { createDb } from '../client.js';
import { serviceCatalogItems } from '../schema/index.js';
import { eq } from 'drizzle-orm';

async function run() {
  const databaseUrl = process.env.DATABASE_URL || 'postgresql://rivertown:rivertown@localhost:5432/rivertown';
  const db = createDb(databaseUrl);

  // Get tenant ID
  const { tenants } = await import('../schema/index.js');
  const [tenant] = await db.select().from(tenants).limit(1);
  if (!tenant) { console.log('No tenant found'); process.exit(1); }

  console.log(`Using tenant: ${tenant.name} (${tenant.id})`);

  // Check if already exists
  const [existing] = await db.select().from(serviceCatalogItems)
    .where(eq(serviceCatalogItems.sku, 'RIV-MWGOVSECURE'))
    .limit(1);

  if (existing) {
    console.log('Product RIV-MWGOVSECURE already exists, skipping.');
    process.exit(0);
  }

  const [product] = await db.insert(serviceCatalogItems).values({
    tenantId: tenant.id,
    name: 'Managed Workstation - Gov Security Add On',
    description: 'Gov security add-on per user. Includes 24x7 SOC monitoring, SIEM, NIST/CMMC compliance controls, and audit logging.',
    proposalDescription: 'Government Security Add-On for Managed Workstations — provides 24x7 Security Operations Center (SOC) monitoring and Security Information & Event Management (SIEM) integration to meet federal and state government contract security requirements. Includes continuous threat detection and response, compliance-grade audit logging aligned with NIST 800-171 and CMMC Level 2 requirements, controlled access enforcement, and regular security posture assessments. All security events are monitored around the clock by trained SOC analysts with automated alerting and incident escalation.',
    sku: 'RIV-MWGOVSECURE',
    vendor: 'Rivertown Technology',
    category: 'managed_service',
    itemType: 'per_user',
    defaultUnitCostCents: 1400,
    defaultUnitPriceCents: 3000,
    taxable: true,
    isActive: true,
  }).returning();

  console.log(`Created product: ${product.name} (${product.id})`);
  console.log(`  SKU: ${product.sku}`);
  console.log(`  Cost: $${(product.defaultUnitCostCents! / 100).toFixed(2)}/user`);
  console.log(`  Price: $${(product.defaultUnitPriceCents / 100).toFixed(2)}/user`);
  process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
