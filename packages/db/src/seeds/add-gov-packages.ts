import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || '';
const sql = postgres(DATABASE_URL);
const tid = '679b00c6-b28f-45ad-a68f-0fb825f7db62';

// ── PRODUCTS ──────────────────────────────────────────────────────────

const products = [
  // Core Managed IT Packages
  { sku: 'GOV-CIVICCORE', name: 'CivicCore — Municipal IT Operations', cat: 'managed_service', type: 'per_user',
    desc: 'Entry-level municipal IT package — remote support, endpoint management, patching, RMM, helpdesk, M365 admin, basic network support, documentation.',
    proposal: 'CivicCore provides foundational managed IT services designed for small towns and administrative offices. Includes unlimited remote support, endpoint management and patch automation, 24/7 Remote Monitoring and Management (RMM), full-service help desk with guaranteed response times, Microsoft 365 administration, basic network support and troubleshooting, IT documentation and asset inventory, and an annual technology review with budget recommendations. CivicCore ensures reliable day-to-day IT operations while providing the foundation for future growth.' },

  { sku: 'GOV-CIVICGUARD', name: 'CivicGuard — Standard Government IT', cat: 'managed_service', type: 'per_user',
    desc: 'Standard municipal IT package — enhanced SLA, quarterly reviews, advanced monitoring, compliance support, strategic planning, business continuity.',
    proposal: 'CivicGuard delivers comprehensive managed IT services for cities, counties, and multi-site government organizations. Builds on CivicCore with enhanced SLA response times, quarterly business reviews with executive reporting, advanced infrastructure monitoring and alerting, regulatory compliance support and documentation, vulnerability assessment and remediation, workflow optimization reviews, automated software deployment and configuration management, strategic technology planning aligned with municipal budgets, and business continuity planning. CivicGuard provides the operational maturity needed for growing municipal environments.' },

  { sku: 'GOV-CIVICCOMMAND', name: 'CivicCommand — Enterprise Municipal IT', cat: 'managed_service', type: 'per_user',
    desc: 'Enterprise municipal IT package — premium response, full compliance advisory, executive governance, priority escalation, dedicated strategic planning.',
    proposal: 'CivicCommand provides enterprise-grade managed IT services for larger municipalities, public safety departments, and compliance-heavy government operations. Includes everything in CivicGuard plus premium response times with priority escalation paths, full compliance advisory services (CJIS, HIPAA, NIST), executive governance and technology steering committee participation, dedicated strategic technology planning and roadmap development, enhanced monthly reporting with KPI dashboards, custom system integrations, advanced operational continuity with tested failover procedures, and a named account team with direct escalation access. CivicCommand is designed for organizations where technology reliability directly impacts public safety and citizen services.' },

  // Cybersecurity Packages
  { sku: 'GOV-SHIELDBASIC', name: 'ShieldBasic — Foundational Security', cat: 'security', type: 'per_user',
    desc: 'Foundational cybersecurity — MFA, EDR, security awareness training, phishing simulation, email security baseline.',
    proposal: 'ShieldBasic provides essential cybersecurity protections for government organizations. Includes Multi-Factor Authentication (MFA) deployment and management across all user accounts, Enterprise Endpoint Detection and Response (EDR) with automated threat containment, security awareness training program with monthly interactive modules, phishing simulation campaigns with tracking and reporting, and email security baseline including spam filtering, attachment scanning, and impersonation protection. ShieldBasic establishes the security foundation required for responsible government IT operations.' },

  { sku: 'GOV-SHIELDOPS', name: 'ShieldOps — Government Security Standard', cat: 'security', type: 'per_user',
    desc: 'Government security standard — DNS filtering, SaaS backup, encryption, 24/7 SOC, advanced threat response, security reporting.',
    proposal: 'ShieldOps delivers government-standard cybersecurity services building on ShieldBasic. Adds DNS-layer filtering blocking malicious domains and enforcing web policies, SaaS application backup protecting Microsoft 365 data, drive and device encryption management, 24/7 Security Operations Center (SOC) monitoring by trained analysts, advanced threat detection and response with guided remediation, and monthly security posture reporting with trend analysis. ShieldOps meets the security requirements expected by most municipal and county government operations.' },

  { sku: 'GOV-SHIELDCOMPLIANCE', name: 'ShieldCompliance — CJIS/HIPAA/PCI Security', cat: 'security', type: 'per_user',
    desc: 'Compliance-grade security — SIEM, GRC, application control, audit support, incident response planning, compliance documentation.',
    proposal: 'ShieldCompliance provides the highest tier of cybersecurity services for government organizations handling regulated data. Includes everything in ShieldOps plus Security Information and Event Management (SIEM) with centralized log collection and real-time correlation, Governance Risk and Compliance (GRC) framework management, application whitelisting and control, comprehensive audit preparation and support for CJIS, HIPAA, and PCI requirements, incident response planning and tabletop exercises, compliance documentation including System Security Plans (SSP) and Plans of Action & Milestones (POA&M), and policy development and guidance aligned with NIST 800-171 and CMMC frameworks.' },

  // Infrastructure Line Items
  { sku: 'GOV-SVR-PHYS', name: 'GovServer Physical', cat: 'managed_service', type: 'per_device',
    desc: 'Physical server management — hardware oversight, hypervisor, monitoring, security, patch management.',
    proposal: 'Physical server management services including hardware health monitoring, hypervisor administration, 24/7 uptime monitoring with automated alerting, security hardening and patch management, performance optimization, and capacity planning. Covers the complete lifecycle of physical server infrastructure.' },

  { sku: 'GOV-SVR-VIRT', name: 'GovServer Virtual', cat: 'managed_service', type: 'per_device',
    desc: 'Virtual server management — OS, monitoring, security, backup integration.',
    proposal: 'Virtual server management services including operating system administration, 24/7 monitoring and alerting, security patching and hardening, backup integration and verification, performance tuning, and resource allocation management within VMware or Hyper-V environments.' },

  { sku: 'GOV-BK-ENDPOINT', name: 'GovBackup Endpoint', cat: 'backup', type: 'per_device',
    desc: 'Workstation backup — automated file-level backup, cloud sync, restore support.',
    proposal: 'Government workstation backup services providing automated file-level data protection with secure cloud synchronization. Covers user documents, desktop files, and application data with self-service and technician-assisted restore capabilities. Ensures endpoint data resilience for municipal staff.' },

  { sku: 'GOV-BK-CLOUD365', name: 'GovBackup Cloud365', cat: 'backup', type: 'per_user',
    desc: 'Microsoft 365 backup — Exchange, OneDrive, SharePoint, Teams data protection.',
    proposal: 'Microsoft 365 data protection for government organizations covering Exchange Online mailboxes, OneDrive files, SharePoint sites, and Teams data. Provides independent backup and granular restore capabilities beyond Microsoft native retention, ensuring protection against accidental deletion, ransomware, and regulatory compliance holds.' },

  { sku: 'GOV-BK-SERVER', name: 'GovBackup Server', cat: 'backup', type: 'per_device',
    desc: 'Server/VM backup — daily image-based backups, offsite replication, quarterly test restores.',
    proposal: 'Government server and virtual machine backup services using image-based daily backups with offsite cloud replication. Includes backup monitoring, automated integrity verification with screenshot testing, quarterly test restores with documented results, and disaster recovery procedures ensuring rapid restoration of critical municipal systems.' },

  { sku: 'GOV-BK-SQL', name: 'GovBackup SQL', cat: 'backup', type: 'per_device',
    desc: 'Compliance/SQL/critical workload backup — transaction-level protection, point-in-time recovery.',
    proposal: 'Specialized backup services for SQL databases and compliance-critical workloads including transaction log backups for point-in-time recovery, application-aware snapshot protection, database integrity verification, and documented recovery procedures meeting regulatory requirements for data retention and availability.' },

  // Premium Add-Ons
  { sku: 'GOV-RESPONSE-247', name: 'GovResponse 24x7', cat: 'support_hours', type: 'recurring',
    desc: '24/7 emergency incident support — critical outages, security incidents, public safety continuity.',
    proposal: '24/7/365 emergency incident response services for critical situations including system-wide outages, active security incidents, and public safety system disruptions. Provides immediate phone access to senior engineers with guaranteed 15-minute response for critical issues. Includes after-hours remote and onsite support as needed to restore operations and maintain continuity of essential government services.' },

  { sku: 'GOV-SECURESTART', name: 'GovTransition SecureStart', cat: 'managed_service', type: 'one_time',
    desc: 'Government onboarding — secure transition, discovery, documentation, security baseline, compliance review.',
    proposal: 'Comprehensive government IT onboarding and secure transition program. Includes full infrastructure discovery and documentation, monitoring and security tool deployment, coordination with incumbent provider for knowledge transfer, security baseline assessment and immediate remediation of critical findings, initial compliance review against applicable standards (CJIS, HIPAA, NIST), network documentation and diagram creation, user account audit and access review, and staff orientation with new procedures and support channels. Project-managed with defined milestones and go-live support.' },

  { sku: 'GOV-COMPLIANCE-ADV', name: 'GovCompliance Advisory', cat: 'security', type: 'recurring',
    desc: 'Regulatory and security governance — HIPAA, CJIS, PCI audit readiness, policy support.',
    proposal: 'Ongoing regulatory compliance advisory services for government organizations subject to CJIS, HIPAA, PCI-DSS, or other regulatory frameworks. Includes compliance gap assessments, policy development and maintenance, staff training on compliance requirements, audit preparation and support, evidence collection and documentation management, remediation planning and tracking, and regular compliance posture reporting to leadership.' },
];

// ── BUNDLES ──────────────────────────────────────────────────────────

const bundles = [
  { name: 'CivicCore Bundle', desc: 'Complete CivicCore package — all underlying products for entry-level municipal IT.',
    skus: ['RIV-MWOR', 'RIV-MUSR', 'RIV-MNET', 'RIV-LICMGMT'] },

  { name: 'CivicGuard Bundle', desc: 'Complete CivicGuard package — standard government IT with compliance and planning.',
    skus: ['RIV-MWOR', 'RIV-MUSR', 'RIV-MNET', 'RIV-MPRN', 'RIV-LICMGMT', 'RIV-VULN'] },

  { name: 'CivicCommand Bundle', desc: 'Complete CivicCommand package — enterprise municipal IT with premium support.',
    skus: ['RIV-MWOR', 'RIV-MUSR', 'RIV-MNET', 'RIV-MPRN', 'RIV-LICMGMT', 'RIV-VULN', 'RIV-PROJHR'] },

  { name: 'ShieldBasic Bundle', desc: 'Foundational security — MFA, EDR, training, phishing sim.',
    skus: ['RIV-MFA', 'RIV-EDR', 'RIV-SAT'] },

  { name: 'ShieldOps Bundle', desc: 'Government security standard — adds SOC, DNS filtering, backup.',
    skus: ['RIV-MFA', 'RIV-EDR', 'RIV-SAT', 'RIV-DNSFLT', 'RIV-SOC', 'RIV-M365BK'] },

  { name: 'ShieldCompliance Bundle', desc: 'Full compliance security — adds SIEM, CJIS, audit support.',
    skus: ['RIV-MFA', 'RIV-EDR', 'RIV-SAT', 'RIV-DNSFLT', 'RIV-SOC', 'RIV-M365BK', 'RIV-SIEM', 'RIV-CJIS', 'RIV-COMPNIST'] },
];

async function run() {
  // Create products
  let prodCreated = 0;
  for (const p of products) {
    const existing = await sql`SELECT id FROM service_catalog_items WHERE tenant_id = ${tid} AND sku = ${p.sku}`;
    if (existing.length > 0) {
      console.log(`SKIP: ${p.sku} - ${p.name}`);
      continue;
    }
    await sql`INSERT INTO service_catalog_items (tenant_id, name, description, proposal_description, sku, vendor, category, item_type, default_unit_cost_cents, default_unit_price_cents, taxable, is_active)
      VALUES (${tid}, ${p.name}, ${p.desc}, ${p.proposal}, ${p.sku}, ${'Rivertown Technology'}, ${p.cat}, ${p.type}, ${500}, ${1000}, true, true)`;
    prodCreated++;
    console.log(`PRODUCT: ${p.sku} - ${p.name}`);
  }

  // Create bundles
  let bundleCreated = 0;
  for (const b of bundles) {
    const existing = await sql`SELECT id FROM service_catalog_bundles WHERE tenant_id = ${tid} AND name = ${b.name}`;
    if (existing.length > 0) {
      console.log(`SKIP BUNDLE: ${b.name}`);
      continue;
    }

    const [bundle] = await sql`INSERT INTO service_catalog_bundles (tenant_id, name, description) VALUES (${tid}, ${b.name}, ${b.desc}) RETURNING id`;

    for (let i = 0; i < b.skus.length; i++) {
      const sku = b.skus[i];
      const [item] = await sql`SELECT id FROM service_catalog_items WHERE tenant_id = ${tid} AND sku = ${sku}`;
      if (item) {
        await sql`INSERT INTO service_catalog_bundle_items (bundle_id, catalog_item_id, quantity_multiplier, sort_order) VALUES (${bundle.id}, ${item.id}, ${'1'}, ${i})`;
      } else {
        console.log(`  WARN: SKU ${sku} not found for bundle ${b.name}`);
      }
    }

    bundleCreated++;
    console.log(`BUNDLE: ${b.name} (${b.skus.length} items)`);
  }

  console.log(`\nDone: ${prodCreated} products, ${bundleCreated} bundles created`);
  await sql.end();
}

run().catch(e => { console.error(e); process.exit(1); });
