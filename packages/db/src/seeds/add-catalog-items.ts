import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || '';
const sql = postgres(DATABASE_URL);
const tid = '679b00c6-b28f-45ad-a68f-0fb825f7db62';

interface CatalogItem {
  sku: string; name: string; cat: string; type: string; desc: string; proposal: string;
}

const items: CatalogItem[] = [
  // Managed Services
  { sku: 'RIV-MWLAP', name: 'Managed Laptop', cat: 'managed_service', type: 'per_device',
    desc: 'Managed laptop — monitoring, patching, endpoint protection, remote support.',
    proposal: 'Comprehensive managed laptop services including 24/7 monitoring, automated patch management, enterprise endpoint protection, remote troubleshooting and support, and asset lifecycle tracking. Ensures mobile workforce devices remain secure, updated, and performing optimally.' },
  { sku: 'RIV-MMOB', name: 'Managed Mobile Device', cat: 'managed_service', type: 'per_device',
    desc: 'Managed mobile device — MDM, security policies, remote wipe capability.',
    proposal: 'Mobile Device Management (MDM) services including security policy enforcement, application management, remote lock and wipe capabilities, and compliance monitoring for smartphones and tablets across iOS and Android platforms.' },
  { sku: 'RIV-MNET', name: 'Managed Network Device', cat: 'managed_service', type: 'per_device',
    desc: 'Managed network device — switches, access points, routers. Monitoring and config management.',
    proposal: 'Managed network infrastructure services covering switches, wireless access points, and routers. Includes 24/7 uptime monitoring, configuration management, firmware updates, performance optimization, and rapid incident response for network equipment.' },
  { sku: 'RIV-MHYP', name: 'Managed Hypervisor', cat: 'managed_service', type: 'per_device',
    desc: 'Managed hypervisor — VMware/Hyper-V host management, monitoring, patching.',
    proposal: 'Hypervisor management services for VMware vSphere and Microsoft Hyper-V environments. Includes host monitoring, performance tuning, capacity planning, patch management, and high availability configuration to ensure virtualized infrastructure runs at peak efficiency.' },
  { sku: 'RIV-MPRN', name: 'Managed Printer', cat: 'managed_service', type: 'per_device',
    desc: 'Managed printer — monitoring, driver management, print queue support.',
    proposal: 'Managed print services including printer monitoring, driver deployment and management, print queue administration, toner level tracking, and end-user print support across networked and local printers.' },
  { sku: 'RIV-MUSR', name: 'Managed User (Help Desk)', cat: 'managed_service', type: 'per_user',
    desc: 'Per-user help desk support — unlimited tickets, password resets, account management.',
    proposal: 'Comprehensive per-user IT support services including unlimited help desk ticket submissions, password resets, account provisioning and deprovisioning, software installation assistance, user training, and productivity optimization. Guaranteed response times per SLA.' },

  // Security
  { sku: 'RIV-EDR', name: 'Endpoint Detection & Response (EDR)', cat: 'security', type: 'per_device',
    desc: 'Advanced EDR — threat detection, automated response, threat hunting.',
    proposal: 'Enterprise-grade Endpoint Detection and Response (EDR) providing advanced threat detection, automated containment and response, behavioral analysis, threat hunting capabilities, and detailed forensic reporting for rapid incident investigation.' },
  { sku: 'RIV-SIEM', name: 'SIEM & Log Management', cat: 'security', type: 'per_user',
    desc: 'SIEM — centralized log collection, correlation, alerting, compliance reporting.',
    proposal: 'Security Information and Event Management (SIEM) services providing centralized log collection from all network devices and endpoints, real-time event correlation, automated alerting, compliance reporting, and log retention meeting regulatory requirements including CJIS and NIST 800-171.' },
  { sku: 'RIV-SOC', name: '24/7 SOC Monitoring', cat: 'security', type: 'per_user',
    desc: '24/7 Security Operations Center monitoring — threat detection, escalation, response.',
    proposal: '24/7/365 Security Operations Center (SOC) monitoring providing continuous threat surveillance by trained security analysts. Includes real-time threat detection, alert triage, incident escalation, guided remediation, and monthly security posture reporting.' },
  { sku: 'RIV-VULN', name: 'Vulnerability Scanning', cat: 'security', type: 'recurring',
    desc: 'Quarterly vulnerability scans — internal and external network assessment.',
    proposal: 'Scheduled vulnerability assessment services including quarterly internal and external network scans, web application testing, prioritized remediation recommendations, executive summary reporting, and compliance documentation for audit support.' },
  { sku: 'RIV-SAT', name: 'Security Awareness Training', cat: 'security', type: 'per_user',
    desc: 'Security awareness training — phishing simulations, compliance training modules.',
    proposal: 'Comprehensive security awareness training program including monthly phishing simulation campaigns, interactive training modules covering social engineering, password hygiene, data handling, and regulatory compliance. Includes tracking dashboards and completion reporting.' },
  { sku: 'RIV-DNSFLT', name: 'DNS Filtering', cat: 'security', type: 'per_user',
    desc: 'DNS-level content filtering — blocks malicious sites, enforces web policies.',
    proposal: 'DNS-layer security filtering providing protection against malicious domains, phishing sites, and command-and-control communications. Includes customizable web content policies, bandwidth management, and detailed browsing activity reporting.' },
  { sku: 'RIV-MFA', name: 'Multi-Factor Authentication', cat: 'security', type: 'per_user',
    desc: 'MFA deployment and management — app-based, hardware token support.',
    proposal: 'Multi-Factor Authentication (MFA) deployment and ongoing management across all user accounts. Supports authenticator apps, hardware tokens, and biometric methods. Includes user enrollment, token management, and policy enforcement to prevent unauthorized access.' },
  { sku: 'RIV-FW', name: 'Managed Firewall', cat: 'security', type: 'per_device',
    desc: 'Managed firewall — rule management, monitoring, firmware updates, VPN support.',
    proposal: 'Managed firewall services including rule configuration and optimization, 24/7 monitoring, firmware and signature updates, VPN tunnel management, intrusion detection/prevention, and network segmentation support for compliance requirements.' },

  // Backup
  { sku: 'RIV-BKSVR', name: 'Server Backup', cat: 'backup', type: 'per_device',
    desc: 'Server backup — daily image-based backups, offsite replication, test restores.',
    proposal: 'Comprehensive server backup services using image-based daily backups with offsite cloud replication. Includes backup monitoring, automated integrity verification, quarterly test restores, and documented disaster recovery procedures ensuring rapid restoration of critical systems.' },
  { sku: 'RIV-BKWKS', name: 'Workstation Backup', cat: 'backup', type: 'per_device',
    desc: 'Workstation backup — file-level backup, cloud sync, restore support.',
    proposal: 'Workstation data protection through automated file-level backups with secure cloud synchronization. Covers user documents, desktop files, and application data with self-service restore capability and technician-assisted recovery support.' },
  { sku: 'RIV-BDR', name: 'Backup & Disaster Recovery (BDR)', cat: 'backup', type: 'recurring',
    desc: 'BDR appliance — onsite + cloud backup, instant virtualization, DR testing.',
    proposal: 'Business Continuity and Disaster Recovery solution combining onsite backup appliance with cloud replication. Features instant virtualization for rapid failover, automated backup verification with screenshot testing, and annual DR plan testing and documentation.' },
  { sku: 'RIV-M365BK', name: 'Microsoft 365 Backup', cat: 'backup', type: 'per_user',
    desc: 'M365 backup — Exchange, OneDrive, SharePoint, Teams data protection.',
    proposal: 'Microsoft 365 data protection covering Exchange Online mailboxes, OneDrive files, SharePoint sites, and Teams data. Provides independent backup and granular restore capabilities beyond Microsoft native retention, ensuring protection against accidental deletion, ransomware, and compliance holds.' },

  // Support Hours
  { sku: 'RIV-PROJHR', name: 'Project Hours', cat: 'support_hours', type: 'block_time',
    desc: 'Pre-purchased project hours for planned IT work outside standard managed services.',
    proposal: 'Block of pre-purchased professional services hours for planned technology projects, system migrations, infrastructure upgrades, and strategic initiatives outside the scope of standard managed services. Hours are tracked and reported monthly with unused hours rolling forward per contract terms.' },
  { sku: 'RIV-EMGHR', name: 'Emergency/After-Hours Support', cat: 'support_hours', type: 'one_time',
    desc: 'Emergency or after-hours support — billed per incident for non-covered critical issues.',
    proposal: 'Emergency and after-hours technical support for critical incidents occurring outside standard business hours and beyond included SLA coverage. Billed per incident with immediate response for system-down situations affecting business operations or public safety.' },

  // Compliance
  { sku: 'RIV-CJIS', name: 'CJIS Compliance Management', cat: 'security', type: 'recurring',
    desc: 'CJIS compliance — policy maintenance, staff certification tracking, audit support.',
    proposal: 'Criminal Justice Information Services (CJIS) compliance management program including security policy development and maintenance, technical control implementation, staff certification tracking, background check compliance, network segregation management, and comprehensive audit preparation and support.' },
  { sku: 'RIV-COMPNIST', name: 'NIST/CMMC Compliance', cat: 'security', type: 'recurring',
    desc: 'NIST 800-171 / CMMC compliance — assessment, remediation, documentation.',
    proposal: 'NIST 800-171 and CMMC compliance services including initial gap assessment, remediation planning and implementation, System Security Plan (SSP) development, Plan of Action & Milestones (POA&M) management, and ongoing compliance monitoring with annual reassessment.' },

  // Network / Infrastructure
  { sku: 'RIV-WIFISURVEY', name: 'Wireless Site Survey', cat: 'other', type: 'one_time',
    desc: 'Wireless site survey — RF analysis, heat mapping, AP placement recommendations.',
    proposal: 'Professional wireless site survey including RF spectrum analysis, signal heat mapping, interference identification, and detailed access point placement recommendations to ensure optimal wireless coverage and performance across all facility areas.' },
  { sku: 'RIV-NETAUDIT', name: 'Network Assessment', cat: 'other', type: 'one_time',
    desc: 'Comprehensive network assessment — topology review, performance analysis, security audit.',
    proposal: 'Comprehensive network infrastructure assessment including topology documentation, performance benchmarking, security posture evaluation, bandwidth utilization analysis, and prioritized recommendations for improvements. Deliverable includes detailed report with executive summary and technical findings.' },

  // Onboarding / Transition
  { sku: 'RIV-ONBOARD', name: 'Client Onboarding & Transition', cat: 'managed_service', type: 'one_time',
    desc: 'New client onboarding — discovery, documentation, tool deployment, knowledge transfer.',
    proposal: 'Structured client onboarding program including comprehensive IT environment discovery and documentation, monitoring agent deployment, security tool installation, user account setup, knowledge transfer from incumbent provider, and staff orientation. Includes project management oversight and go-live support.' },

  // Licensing
  { sku: 'RIV-LICMGMT', name: 'License Management & Optimization', cat: 'license', type: 'recurring',
    desc: 'Software license management — tracking, compliance, renewal coordination, cost optimization.',
    proposal: 'Software license management services including inventory tracking, compliance monitoring, renewal coordination, vendor liaison, and ongoing cost optimization recommendations. Ensures proper licensing posture while identifying opportunities to reduce software spend.' },
];

async function run() {
  let created = 0;
  let skipped = 0;
  for (const item of items) {
    const existing = await sql`SELECT id FROM service_catalog_items WHERE tenant_id = ${tid} AND sku = ${item.sku}`;
    if (existing.length > 0) {
      console.log(`SKIP: ${item.sku} - ${item.name}`);
      skipped++;
      continue;
    }
    await sql`INSERT INTO service_catalog_items (tenant_id, name, description, proposal_description, sku, vendor, category, item_type, default_unit_cost_cents, default_unit_price_cents, taxable, is_active)
      VALUES (${tid}, ${item.name}, ${item.desc}, ${item.proposal}, ${item.sku}, ${'Rivertown Technology'}, ${item.cat}, ${item.type}, ${500}, ${1000}, true, true)`;
    created++;
    console.log(`CREATED: ${item.sku} - ${item.name}`);
  }
  console.log(`\nDone: ${created} created, ${skipped} skipped (already exist)`);
  await sql.end();
}
run().catch(e => { console.error(e); process.exit(1); });
