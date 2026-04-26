import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || '';
const sql = postgres(DATABASE_URL);
const tid = '679b00c6-b28f-45ad-a68f-0fb825f7db62';

interface PolicyAreaDef {
  code: string;
  title: string;
  description: string;
  controls: ControlDef[];
}

interface ControlDef {
  controlCode: string;
  title: string;
  description: string;
  nistMapping: string;
  controlType: 'technical' | 'administrative' | 'physical';
  severity?: 'critical' | 'high' | 'medium' | 'low';
}

function assessmentMethod(controlType: string): string {
  if (controlType === 'technical') return 'test';
  return 'examine'; // administrative and physical
}

const policyAreas: PolicyAreaDef[] = [
  // PA-1: Information Exchange Agreements
  {
    code: 'PA-1',
    title: 'Information Exchange Agreements',
    description: 'Section 5.1 — Requirements for information exchange agreements when sharing CJI between agencies and third parties.',
    controls: [
      { controlCode: '5.1.1', title: 'Info Exchange Agreements', description: 'Agreements must be in place before exchanging CJI', nistMapping: 'SA-9', controlType: 'administrative' },
      { controlCode: '5.1.2', title: 'Management Control Agreements', description: 'Outsourced CJI handling requires MCA with contractor', nistMapping: 'SA-9', controlType: 'administrative' },
      { controlCode: '5.1.3', title: 'Outsourcing Standards', description: 'Contractors must meet same security requirements as agency', nistMapping: 'SA-9', controlType: 'administrative' },
      { controlCode: '5.1.4', title: 'Secondary Dissemination', description: 'CJI shared beyond receiving agency must be documented and approved', nistMapping: 'AC-21', controlType: 'administrative' },
    ],
  },
  // PA-2: Security Awareness Training
  {
    code: 'PA-2',
    title: 'Security Awareness Training',
    description: 'Section 5.2 — Requirements for security awareness training for all personnel with access to CJI.',
    controls: [
      { controlCode: '5.2.1', title: 'Awareness Topics', description: 'Training must cover CJI handling, incident reporting, password security, social engineering', nistMapping: 'AT-2', controlType: 'administrative' },
      { controlCode: '5.2.2', title: 'Training Records', description: 'All training records must be documented and maintained', nistMapping: 'AT-4', controlType: 'administrative' },
      { controlCode: '5.2.3', title: 'Training Frequency', description: 'Initial training within 6 months of assignment, refresher annually', nistMapping: 'AT-2', controlType: 'administrative' },
    ],
  },
  // PA-3: Incident Response
  {
    code: 'PA-3',
    title: 'Incident Response',
    description: 'Section 5.3 — Requirements for incident response procedures related to CJI security events.',
    controls: [
      { controlCode: '5.3.1', title: 'Reporting', description: 'Security incidents involving CJI must be reported to FBI CJIS ISO', nistMapping: 'IR-6', controlType: 'administrative' },
      { controlCode: '5.3.2', title: 'Management', description: 'Documented incident handling procedures required', nistMapping: 'IR-4', controlType: 'administrative' },
      { controlCode: '5.3.3', title: 'Evidence Collection', description: 'Evidence preservation and chain of custody procedures', nistMapping: 'IR-4', controlType: 'administrative' },
      { controlCode: '5.3.4', title: 'Training', description: 'Incident response training for all personnel with CJI access', nistMapping: 'IR-2', controlType: 'administrative' },
      { controlCode: '5.3.5', title: 'Monitoring', description: 'Ongoing tracking and documentation of security incidents', nistMapping: 'IR-5', controlType: 'administrative' },
    ],
  },
  // PA-4: Auditing and Accountability
  {
    code: 'PA-4',
    title: 'Auditing and Accountability',
    description: 'Section 5.4 — Requirements for audit logging, monitoring, and accountability for CJI systems.',
    controls: [
      { controlCode: '5.4.1', title: 'Auditable Events', description: 'Systems must log successful/failed login attempts, data access, admin actions', nistMapping: 'AU-2', controlType: 'technical' },
      { controlCode: '5.4.2', title: 'Content of Audit Records', description: 'Logs must include who, what, when, where, outcome', nistMapping: 'AU-3', controlType: 'technical' },
      { controlCode: '5.4.3', title: 'Audit Monitoring and Reporting', description: 'Regular review and analysis of audit records', nistMapping: 'AU-6', controlType: 'technical' },
      { controlCode: '5.4.4', title: 'Time Stamps', description: 'System clocks synchronized via NTP for accurate audit trails', nistMapping: 'AU-8', controlType: 'technical' },
      { controlCode: '5.4.5', title: 'Protection of Audit Information', description: 'Audit logs protected from unauthorized modification or deletion', nistMapping: 'AU-9', controlType: 'technical' },
      { controlCode: '5.4.6', title: 'Audit Record Retention', description: 'Minimum 365-day retention of audit records', nistMapping: 'AU-11', controlType: 'administrative' },
    ],
  },
  // PA-5: Access Control
  {
    code: 'PA-5',
    title: 'Access Control',
    description: 'Section 5.5 — Requirements for controlling access to CJI systems, data, and resources.',
    controls: [
      { controlCode: '5.5.1', title: 'Account Management', description: 'Formal account management procedures for CJI systems', nistMapping: 'AC-2', controlType: 'administrative' },
      { controlCode: '5.5.2', title: 'Access Enforcement', description: 'Systems enforce approved authorizations for CJI access', nistMapping: 'AC-3', controlType: 'technical' },
      { controlCode: '5.5.3', title: 'Unsuccessful Login Attempts', description: 'Account lockout after maximum 5 consecutive failed attempts', nistMapping: 'AC-7', controlType: 'technical' },
      { controlCode: '5.5.4', title: 'System Use Notification', description: 'Login banner displayed before granting CJI system access', nistMapping: 'AC-8', controlType: 'technical' },
      { controlCode: '5.5.5', title: 'Session Lock', description: 'Automatic session lock after 30 minutes of inactivity', nistMapping: 'AC-11', controlType: 'technical' },
      { controlCode: '5.5.6', title: 'Remote Access', description: 'Remote access to CJI must use encrypted VPN with MFA', nistMapping: 'AC-17', controlType: 'technical' },
      { controlCode: '5.5.7', title: 'Wireless Access', description: 'Wireless connections to CJI networks require additional controls', nistMapping: 'AC-18', controlType: 'technical' },
      { controlCode: '5.5.8', title: 'Mobile Device Access', description: 'Mobile devices accessing CJI subject to MDM requirements', nistMapping: 'AC-19', controlType: 'technical' },
      { controlCode: '5.5.9', title: 'Least Privilege', description: 'Users granted minimum access necessary for job function', nistMapping: 'AC-6', controlType: 'administrative' },
      { controlCode: '5.5.10', title: 'Role-Based Access', description: 'Access control based on defined roles and responsibilities', nistMapping: 'AC-3', controlType: 'administrative' },
    ],
  },
  // PA-6: Identification and Authentication
  {
    code: 'PA-6',
    title: 'Identification and Authentication',
    description: 'Section 5.6 — Requirements for identification and authentication of users accessing CJI.',
    controls: [
      { controlCode: '5.6.1', title: 'Unique Identification', description: 'Each user must have unique identifier, no shared accounts', nistMapping: 'IA-4', controlType: 'administrative' },
      { controlCode: '5.6.2', title: 'Authentication Policy', description: 'Documented authentication requirements for CJI access', nistMapping: 'IA-1', controlType: 'administrative' },
      { controlCode: '5.6.3', title: 'Standard Authentication', description: 'Minimum password: 8 chars, complexity, 90-day expiration, 10 history', nistMapping: 'IA-5', controlType: 'technical' },
      { controlCode: '5.6.4', title: 'Advanced Authentication (MFA)', description: 'Multi-factor authentication required for remote/elevated CJI access', nistMapping: 'IA-2', controlType: 'technical', severity: 'critical' },
      { controlCode: '5.6.5', title: 'Identifier Management', description: 'User ID lifecycle management including disable after 90 days inactive', nistMapping: 'IA-4', controlType: 'administrative' },
      { controlCode: '5.6.6', title: 'Authenticator Management', description: 'Password/token storage, distribution, and revocation procedures', nistMapping: 'IA-5', controlType: 'administrative' },
      { controlCode: '5.6.7', title: 'Authenticator Feedback', description: 'System must obscure authentication feedback (mask passwords)', nistMapping: 'IA-6', controlType: 'technical' },
    ],
  },
  // PA-7: Configuration Management
  {
    code: 'PA-7',
    title: 'Configuration Management',
    description: 'Section 5.7 — Requirements for configuration management of CJI systems and network infrastructure.',
    controls: [
      { controlCode: '5.7.1', title: 'Access Restrictions for Changes', description: 'Only authorized personnel can modify CJI system configurations', nistMapping: 'CM-5', controlType: 'administrative' },
      { controlCode: '5.7.2', title: 'Least Functionality', description: 'Systems configured with minimum services, ports, protocols needed', nistMapping: 'CM-7', controlType: 'technical', severity: 'high' },
      { controlCode: '5.7.3', title: 'Network Diagram', description: 'Current and accurate network topology documentation maintained', nistMapping: 'CM-2', controlType: 'administrative' },
      { controlCode: '5.7.4', title: 'Security of Configuration Documentation', description: 'Configuration documentation protected from unauthorized disclosure', nistMapping: 'CM-6', controlType: 'administrative' },
    ],
  },
  // PA-8: Media Protection
  {
    code: 'PA-8',
    title: 'Media Protection',
    description: 'Section 5.8 — Requirements for protection of physical and electronic media containing CJI.',
    controls: [
      { controlCode: '5.8.1', title: 'Media Storage and Access', description: 'Physical media containing CJI stored in controlled area', nistMapping: 'MP-2', controlType: 'physical' },
      { controlCode: '5.8.2', title: 'Media Transport', description: 'CJI media encrypted during physical transport', nistMapping: 'MP-5', controlType: 'physical' },
      { controlCode: '5.8.3', title: 'Electronic Media Sanitization', description: 'Proper sanitization of electronic media before disposal or reuse', nistMapping: 'MP-6', controlType: 'physical', severity: 'high' },
      { controlCode: '5.8.4', title: 'Physical Media Disposal', description: 'Physical destruction of media containing CJI (shredding, degaussing)', nistMapping: 'MP-6', controlType: 'physical' },
    ],
  },
  // PA-9: Physical Protection
  {
    code: 'PA-9',
    title: 'Physical Protection',
    description: 'Section 5.9 — Requirements for physical protection of facilities and areas where CJI is processed or stored.',
    controls: [
      { controlCode: '5.9.1', title: 'Physically Secure Location', description: 'CJI processing equipment in physically secure, access-controlled areas', nistMapping: 'PE-3', controlType: 'physical', severity: 'high' },
      { controlCode: '5.9.2', title: 'Physical Access Authorizations', description: 'Maintain current list of authorized personnel for secure areas', nistMapping: 'PE-2', controlType: 'administrative' },
      { controlCode: '5.9.3', title: 'Physical Access Control', description: 'Entry controls (card readers, locks, guards) for areas with CJI systems', nistMapping: 'PE-3', controlType: 'physical' },
      { controlCode: '5.9.4', title: 'Access Control for Output', description: 'Printed CJI output controlled, screens positioned to prevent viewing', nistMapping: 'PE-5', controlType: 'physical' },
      { controlCode: '5.9.5', title: 'Monitoring Physical Access', description: 'Physical access to CJI areas monitored via cameras, logs, or guards', nistMapping: 'PE-6', controlType: 'physical' },
      { controlCode: '5.9.6', title: 'Visitor Control', description: 'Visitors escorted and logged in areas with CJI access', nistMapping: 'PE-7', controlType: 'physical' },
      { controlCode: '5.9.7', title: 'Delivery and Removal', description: 'Equipment movement in/out of secure areas tracked and authorized', nistMapping: 'PE-16', controlType: 'physical' },
    ],
  },
  // PA-10: Systems and Communications Protection
  {
    code: 'PA-10',
    title: 'Systems and Communications Protection',
    description: 'Section 5.10 — Requirements for protecting CJI during transmission and processing across systems and networks.',
    controls: [
      { controlCode: '5.10.1', title: 'Boundary Protection', description: 'Firewalls/DMZs at network boundaries where CJI traverses', nistMapping: 'SC-7', controlType: 'technical', severity: 'critical' },
      { controlCode: '5.10.2', title: 'Encryption in Transit', description: 'FIPS 140-2 certified encryption for CJI transmitted across networks', nistMapping: 'SC-13', controlType: 'technical', severity: 'critical' },
      { controlCode: '5.10.3', title: 'Intrusion Detection', description: 'IDS/IPS monitoring on CJI network segments', nistMapping: 'SI-4', controlType: 'technical', severity: 'high' },
      { controlCode: '5.10.4', title: 'VoIP Security', description: 'Voice over IP carrying CJI must meet same encryption requirements', nistMapping: 'SC-7', controlType: 'technical' },
      { controlCode: '5.10.5', title: 'Cloud Computing', description: 'Cloud services processing CJI must meet all CJIS requirements', nistMapping: 'SC-7', controlType: 'technical', severity: 'high' },
      { controlCode: '5.10.6', title: 'Encryption at Rest', description: 'CJI stored on electronic media encrypted with FIPS 140-2 validated modules', nistMapping: 'SC-28', controlType: 'technical', severity: 'critical' },
      { controlCode: '5.10.7', title: 'PKI Requirements', description: 'Digital certificates from approved CAs for CJI system authentication', nistMapping: 'SC-17', controlType: 'technical' },
    ],
  },
  // PA-11: Formal Audits
  {
    code: 'PA-11',
    title: 'Formal Audits',
    description: 'Section 5.11 — Requirements for formal audit programs conducted by FBI CJIS Division and state CSAs.',
    controls: [
      { controlCode: '5.11.1', title: 'FBI CJIS Division Audits', description: 'Subject to triennial audit by FBI CJIS Division', nistMapping: 'CA-7', controlType: 'administrative' },
      { controlCode: '5.11.2', title: 'CSA Audits', description: 'State CSA conducts regular audit program of agencies and vendors', nistMapping: 'CA-2', controlType: 'administrative' },
      { controlCode: '5.11.3', title: 'Special Security Inquiries', description: 'FBI may conduct special audits triggered by security concerns', nistMapping: 'CA-2', controlType: 'administrative' },
    ],
  },
  // PA-12: Personnel Security
  {
    code: 'PA-12',
    title: 'Personnel Security',
    description: 'Section 5.12 — Requirements for personnel security screening and management for CJI access.',
    controls: [
      { controlCode: '5.12.1', title: 'Personnel Screening', description: 'Fingerprint-based background check required before CJI access', nistMapping: 'PS-3', controlType: 'administrative', severity: 'critical' },
      { controlCode: '5.12.2', title: 'Contractor Screening', description: 'All contractor personnel must pass same screening as agency staff', nistMapping: 'PS-3', controlType: 'administrative', severity: 'critical' },
      { controlCode: '5.12.3', title: 'Personnel Termination', description: 'Immediate revocation of all CJI access upon separation', nistMapping: 'PS-4', controlType: 'administrative', severity: 'high' },
      { controlCode: '5.12.4', title: 'Personnel Transfer', description: 'Review and adjust CJI access when personnel change roles', nistMapping: 'PS-5', controlType: 'administrative' },
      { controlCode: '5.12.5', title: 'Personnel Sanctions', description: 'Formal sanctions process for security policy violations', nistMapping: 'PS-8', controlType: 'administrative' },
    ],
  },
  // PA-13: Mobile Devices
  {
    code: 'PA-13',
    title: 'Mobile Devices',
    description: 'Section 5.13 — Requirements for mobile devices and wireless communications accessing CJI.',
    controls: [
      { controlCode: '5.13.1', title: 'Wireless Communications', description: 'Wireless networks supporting CJI meet enterprise WPA2/WPA3 standards', nistMapping: 'AC-18', controlType: 'technical' },
      { controlCode: '5.13.2', title: 'MDM Requirements', description: 'Mobile Device Management required for devices accessing CJI', nistMapping: 'AC-19', controlType: 'technical', severity: 'high' },
      { controlCode: '5.13.3', title: 'BYOD Policy', description: 'Personal devices accessing CJI must be enrolled in MDM with separation', nistMapping: 'AC-19', controlType: 'administrative' },
      { controlCode: '5.13.4', title: 'Risk Mitigations', description: 'Additional wireless controls: disable Bluetooth, restrict WiFi connections', nistMapping: 'AC-18', controlType: 'technical' },
    ],
  },
];

async function run() {
  // Check if CJIS framework already exists for this tenant
  const existing = await sql`
    SELECT id FROM compliance_frameworks
    WHERE tenant_id = ${tid} AND short_name = 'CJIS'
  `;
  if (existing.length > 0) {
    console.log('CJIS framework already exists for this tenant — skipping.');
    await sql.end();
    process.exit(0);
  }

  // Insert framework
  const [framework] = await sql`
    INSERT INTO compliance_frameworks (tenant_id, name, short_name, version, description, source, is_active, nist_mapping_enabled, metadata)
    VALUES (
      ${tid},
      ${'CJIS Security Policy'},
      ${'CJIS'},
      ${'6.0'},
      ${'FBI Criminal Justice Information Services (CJIS) Security Policy v6.0 — establishes minimum security requirements for access to FBI CJI data.'},
      ${'built_in'},
      ${true},
      ${true},
      ${JSON.stringify({ publisher: 'FBI CJIS Division', effectiveDate: '2022-10-01' })}
    )
    RETURNING id
  `;
  const frameworkId = framework.id;
  console.log(`Created framework: CJIS Security Policy v6.0 (${frameworkId})`);

  let totalPolicyAreas = 0;
  let totalControls = 0;

  for (let paIdx = 0; paIdx < policyAreas.length; paIdx++) {
    const pa = policyAreas[paIdx];

    const [policyArea] = await sql`
      INSERT INTO compliance_policy_areas (tenant_id, framework_id, code, title, description, sort_order)
      VALUES (${tid}, ${frameworkId}, ${pa.code}, ${pa.title}, ${pa.description}, ${paIdx + 1})
      RETURNING id
    `;
    totalPolicyAreas++;

    for (let ctrlIdx = 0; ctrlIdx < pa.controls.length; ctrlIdx++) {
      const ctrl = pa.controls[ctrlIdx];
      const severity = ctrl.severity || 'medium';
      const method = assessmentMethod(ctrl.controlType);

      await sql`
        INSERT INTO compliance_controls (tenant_id, framework_id, policy_area_id, control_code, title, description, nist_mapping, severity, control_type, assessment_method, sort_order)
        VALUES (
          ${tid},
          ${frameworkId},
          ${policyArea.id},
          ${ctrl.controlCode},
          ${ctrl.title},
          ${ctrl.description},
          ${ctrl.nistMapping},
          ${severity},
          ${ctrl.controlType},
          ${method},
          ${ctrlIdx + 1}
        )
      `;
      totalControls++;
    }

    console.log(`  ${pa.code}: ${pa.title} — ${pa.controls.length} controls`);
  }

  console.log(`\nDone: ${totalPolicyAreas} policy areas, ${totalControls} controls created.`);
  await sql.end();
  process.exit(0);
}

run().catch((err) => {
  console.error('CJIS seed failed:', err);
  process.exit(1);
});
