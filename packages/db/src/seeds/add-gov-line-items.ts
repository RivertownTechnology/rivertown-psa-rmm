import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || '';
const sql = postgres(DATABASE_URL);
const tid = '679b00c6-b28f-45ad-a68f-0fb825f7db62';

// New GOV line items that mirror the RIV commercial products
const products = [
  { sku: 'GOV-MWOR', name: 'GovWorkstation', cat: 'managed_service', type: 'per_device',
    desc: 'Government managed workstation — monitoring, patching, endpoint management, security, support.',
    proposal: 'Government managed workstation services including 24/7 monitoring, automated patch management, endpoint security hardening, asset tracking, remote support, and compliance-ready configuration management. All management performed by CJIS-eligible staff where required.' },
  { sku: 'GOV-MWLAP', name: 'GovLaptop', cat: 'managed_service', type: 'per_device',
    desc: 'Government managed laptop — monitoring, patching, endpoint protection, remote support, encryption.',
    proposal: 'Government managed laptop services including 24/7 monitoring, automated patch management, enterprise endpoint protection, drive encryption enforcement, remote troubleshooting, and mobile workforce security policy management.' },
  { sku: 'GOV-MHYP', name: 'GovHypervisor', cat: 'managed_service', type: 'per_device',
    desc: 'Government hypervisor management — VMware/Hyper-V host monitoring, patching, capacity planning.',
    proposal: 'Government hypervisor management for VMware vSphere and Microsoft Hyper-V environments. Includes host monitoring, performance tuning, capacity planning, patch management, high availability configuration, and compliance documentation.' },
  { sku: 'GOV-MNET', name: 'GovNetwork Device', cat: 'managed_service', type: 'per_device',
    desc: 'Government managed network device — switches, APs, routers. Monitoring, config, firmware.',
    proposal: 'Government network infrastructure management covering switches, wireless access points, and routers. Includes 24/7 monitoring, configuration management and backup, firmware updates, performance optimization, VLAN and segmentation management for compliance, and incident response.' },
  { sku: 'GOV-MPRN', name: 'GovPrinter', cat: 'managed_service', type: 'per_device',
    desc: 'Government managed printer — monitoring, drivers, print queue, secure print support.',
    proposal: 'Government managed print services including printer monitoring, driver management, print queue administration, secure print configuration, toner tracking, and end-user support for networked and local printers.' },
  { sku: 'GOV-MUSR', name: 'GovUser (Help Desk)', cat: 'managed_service', type: 'per_user',
    desc: 'Government per-user help desk — unlimited tickets, account management, training, onboarding.',
    proposal: 'Government per-user IT support services including unlimited help desk submissions, password resets, account provisioning and deprovisioning, software assistance, new employee onboarding, security awareness orientation, and productivity support. All staff CJIS-eligible where required.' },
  { sku: 'GOV-FW', name: 'GovFirewall', cat: 'security', type: 'per_device',
    desc: 'Government managed firewall — rules, monitoring, firmware, VPN, network segmentation.',
    proposal: 'Government managed firewall services including rule optimization, 24/7 monitoring, firmware and signature updates, VPN management, intrusion detection/prevention, and network segmentation for CJIS and compliance requirements.' },
  { sku: 'GOV-LOC', name: 'GovLocation', cat: 'managed_service', type: 'recurring',
    desc: 'Government managed location — network infrastructure, connectivity, monitoring per facility.',
    proposal: 'Per-location management of government facility IT infrastructure including network equipment, connectivity monitoring, on-site support coordination, and facility-specific documentation. Covers the unique requirements of each municipal building or department location.' },
];

async function run() {
  let created = 0;
  for (const p of products) {
    const existing = await sql`SELECT id FROM service_catalog_items WHERE tenant_id = ${tid} AND sku = ${p.sku}`;
    if (existing.length > 0) {
      console.log(`SKIP: ${p.sku} - ${p.name}`);
      continue;
    }
    await sql`INSERT INTO service_catalog_items (tenant_id, name, description, proposal_description, sku, vendor, category, item_type, default_unit_cost_cents, default_unit_price_cents, taxable, is_active)
      VALUES (${tid}, ${p.name}, ${p.desc}, ${p.proposal}, ${p.sku}, ${'Rivertown Technology'}, ${p.cat}, ${p.type}, ${500}, ${1000}, true, true)`;
    created++;
    console.log(`CREATED: ${p.sku} - ${p.name}`);
  }

  // Now update bundles to use GOV- SKUs instead of RIV- SKUs
  const bundleSwaps: Record<string, Record<string, string>> = {
    'CivicCore Bundle': { 'RIV-MWOR': 'GOV-MWOR', 'RIV-MUSR': 'GOV-MUSR', 'RIV-MNET': 'GOV-MNET' },
    'CivicGuard Bundle': { 'RIV-MWOR': 'GOV-MWOR', 'RIV-MUSR': 'GOV-MUSR', 'RIV-MNET': 'GOV-MNET', 'RIV-MPRN': 'GOV-MPRN' },
    'CivicCommand Bundle': { 'RIV-MWOR': 'GOV-MWOR', 'RIV-MUSR': 'GOV-MUSR', 'RIV-MNET': 'GOV-MNET', 'RIV-MPRN': 'GOV-MPRN' },
  };

  for (const [bundleName, swaps] of Object.entries(bundleSwaps)) {
    const [bundle] = await sql`SELECT id FROM service_catalog_bundles WHERE tenant_id = ${tid} AND name = ${bundleName}`;
    if (!bundle) { console.log(`Bundle not found: ${bundleName}`); continue; }

    for (const [oldSku, newSku] of Object.entries(swaps)) {
      const [oldItem] = await sql`SELECT id FROM service_catalog_items WHERE tenant_id = ${tid} AND sku = ${oldSku}`;
      const [newItem] = await sql`SELECT id FROM service_catalog_items WHERE tenant_id = ${tid} AND sku = ${newSku}`;
      if (oldItem && newItem) {
        const result = await sql`UPDATE service_catalog_bundle_items SET catalog_item_id = ${newItem.id} WHERE bundle_id = ${bundle.id} AND catalog_item_id = ${oldItem.id}`;
        if (result.count > 0) console.log(`SWAP: ${bundleName}: ${oldSku} → ${newSku}`);
      }
    }
  }

  // Add GOV-FW and GOV-LOC to CivicGuard and CivicCommand
  for (const bundleName of ['CivicGuard Bundle', 'CivicCommand Bundle']) {
    const [bundle] = await sql`SELECT id FROM service_catalog_bundles WHERE tenant_id = ${tid} AND name = ${bundleName}`;
    if (!bundle) continue;
    for (const sku of ['GOV-FW', 'GOV-LOC']) {
      const [item] = await sql`SELECT id FROM service_catalog_items WHERE tenant_id = ${tid} AND sku = ${sku}`;
      if (!item) continue;
      const existing = await sql`SELECT id FROM service_catalog_bundle_items WHERE bundle_id = ${bundle.id} AND catalog_item_id = ${item.id}`;
      if (existing.length === 0) {
        const [maxOrder] = await sql`SELECT COALESCE(MAX(sort_order), 0) + 1 as next_order FROM service_catalog_bundle_items WHERE bundle_id = ${bundle.id}`;
        await sql`INSERT INTO service_catalog_bundle_items (bundle_id, catalog_item_id, quantity_multiplier, sort_order) VALUES (${bundle.id}, ${item.id}, ${'1'}, ${maxOrder.next_order})`;
        console.log(`ADDED: ${bundleName} ← ${sku}`);
      }
    }
  }

  console.log(`\nDone: ${created} products created, bundles updated`);
  await sql.end();
}

run().catch(e => { console.error(e); process.exit(1); });
