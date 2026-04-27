import { FastifyInstance } from 'fastify';
import { eq, and, sql, count, desc, asc, inArray } from 'drizzle-orm';
import {
  complianceFrameworks,
  compliancePolicyAreas,
  complianceControls,
  complianceCustomerScopes,
  complianceAssessments,
  complianceAssessmentItems,
  complianceControlStatuses,
  complianceControlAssets,
  complianceControlTickets,
  complianceEvidence,
  complianceEvidenceControls,
  compliancePoamItems,
  complianceRiskItems,
  compliancePolicies,
  compliancePolicyVersions,
  complianceActivityLog,
  complianceScopedAssets,
  compliancePersonnelScreening,
  complianceTrainingRecords,
  complianceVendors,
  complianceIncidents,
  customers,
  assets,
} from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';

// ── Framework data definitions ──────────────────────────────────────

interface FrameworkDef {
  name: string; shortName: string; version: string; description: string;
  nistMappingEnabled: boolean; metadata: Record<string, string>;
  areas: Array<{ code: string; title: string; controls: Array<{ code: string; title: string; desc: string; nist?: string; type: string; severity?: string; auto?: string; autoCheck?: string }> }>;
}

async function seedFrameworkGeneric(db: any, tenantId: string, data: FrameworkDef) {
  const [fw] = await db.insert(complianceFrameworks).values({
    tenantId, name: data.name, shortName: data.shortName, version: data.version,
    description: data.description, source: 'built_in', nistMappingEnabled: data.nistMappingEnabled,
    metadata: data.metadata,
  }).returning();

  let totalControls = 0;
  for (let i = 0; i < data.areas.length; i++) {
    const area = data.areas[i];
    const [pa] = await db.insert(compliancePolicyAreas).values({
      tenantId, frameworkId: fw.id, code: area.code, title: area.title, sortOrder: i,
    }).returning();
    for (let j = 0; j < area.controls.length; j++) {
      const c = area.controls[j];
      await db.insert(complianceControls).values({
        tenantId, frameworkId: fw.id, policyAreaId: pa.id,
        controlCode: c.code, title: c.title, description: c.desc,
        nistMapping: c.nist || null, severity: c.severity || 'medium',
        controlType: c.type, assessmentMethod: c.type === 'technical' ? 'test' : 'examine',
        automationSource: c.auto || null, automationCheck: c.autoCheck || null,
        sortOrder: j,
      });
      totalControls++;
    }
  }
  return { message: `${data.name} imported`, frameworkId: fw.id, policyAreas: data.areas.length, controlCount: totalControls };
}

const CMMC_DATA: FrameworkDef = {
  name: 'CMMC Level 2 (NIST 800-171)', shortName: 'CMMC', version: '2.0',
  description: 'Cybersecurity Maturity Model Certification Level 2 — protects Controlled Unclassified Information (CUI) based on NIST SP 800-171 Rev 2.',
  nistMappingEnabled: true, metadata: { publisher: 'US Department of Defense', effectiveDate: '2024-12-16' },
  areas: [
    { code: 'AC', title: 'Access Control', controls: [
      { code: 'AC.L2-3.1.1', title: 'Authorized Access Control', desc: 'Limit system access to authorized users, processes, and devices', nist: 'AC-2', type: 'technical', auto: 'm365', autoCheck: 'account_management' },
      { code: 'AC.L2-3.1.2', title: 'Transaction & Function Control', desc: 'Limit system access to types of transactions and functions authorized users are permitted to execute', nist: 'AC-3', type: 'technical' },
      { code: 'AC.L2-3.1.3', title: 'CUI Flow Control', desc: 'Control the flow of CUI in accordance with approved authorizations', nist: 'AC-4', type: 'technical' },
      { code: 'AC.L2-3.1.5', title: 'Least Privilege', desc: 'Employ the principle of least privilege including for specific security functions', nist: 'AC-6', type: 'administrative' },
      { code: 'AC.L2-3.1.6', title: 'Non-Privileged Account Use', desc: 'Use non-privileged accounts when accessing non-security functions', nist: 'AC-6(2)', type: 'technical' },
      { code: 'AC.L2-3.1.7', title: 'Privileged Functions', desc: 'Prevent non-privileged users from executing privileged functions and capture execution in audit logs', nist: 'AC-6(9)', type: 'technical' },
      { code: 'AC.L2-3.1.8', title: 'Unsuccessful Logon Attempts', desc: 'Limit unsuccessful logon attempts', nist: 'AC-7', type: 'technical', auto: 'm365', autoCheck: 'lockout_policy' },
      { code: 'AC.L2-3.1.9', title: 'Privacy & Security Notices', desc: 'Provide privacy and security notices consistent with applicable CUI rules', nist: 'AC-8', type: 'technical', auto: 'ncentral', autoCheck: 'login_banner' },
      { code: 'AC.L2-3.1.10', title: 'Session Lock', desc: 'Use session lock with pattern-hiding displays after period of inactivity', nist: 'AC-11', type: 'technical', auto: 'ncentral', autoCheck: 'screen_lock_policy' },
      { code: 'AC.L2-3.1.11', title: 'Session Termination', desc: 'Terminate session after defined period of inactivity', nist: 'AC-12', type: 'technical' },
      { code: 'AC.L2-3.1.12', title: 'Remote Access Control', desc: 'Monitor and control remote access sessions', nist: 'AC-17', type: 'technical' },
      { code: 'AC.L2-3.1.14', title: 'Remote Access Routing', desc: 'Route remote access via managed access control points', nist: 'AC-17(3)', type: 'technical' },
      { code: 'AC.L2-3.1.15', title: 'Privileged Remote Access', desc: 'Authorize remote execution of privileged commands and access to security-relevant information', nist: 'AC-17(4)', type: 'administrative' },
      { code: 'AC.L2-3.1.16', title: 'Wireless Access Authorization', desc: 'Authorize wireless access prior to allowing such connections', nist: 'AC-18', type: 'technical' },
      { code: 'AC.L2-3.1.17', title: 'Wireless Access Protection', desc: 'Protect wireless access using authentication and encryption', nist: 'AC-18(1)', type: 'technical' },
      { code: 'AC.L2-3.1.18', title: 'Mobile Device Connection', desc: 'Control connection of mobile devices', nist: 'AC-19', type: 'technical', severity: 'high' },
      { code: 'AC.L2-3.1.19', title: 'Encrypt CUI on Mobile', desc: 'Encrypt CUI on mobile devices and mobile computing platforms', nist: 'AC-19(5)', type: 'technical', severity: 'critical', auto: 'ncentral', autoCheck: 'disk_encryption' },
      { code: 'AC.L2-3.1.20', title: 'External Connections', desc: 'Verify and control/limit connections to external systems', nist: 'AC-20', type: 'administrative' },
      { code: 'AC.L2-3.1.21', title: 'Portable Storage Use', desc: 'Limit use of portable storage devices on external systems', nist: 'AC-20(2)', type: 'technical' },
      { code: 'AC.L2-3.1.22', title: 'Public Information Control', desc: 'Control information posted or processed on publicly accessible systems', nist: 'AC-22', type: 'administrative' },
    ]},
    { code: 'AT', title: 'Awareness and Training', controls: [
      { code: 'AT.L2-3.2.1', title: 'Role-Based Risk Awareness', desc: 'Ensure personnel are made aware of security risks associated with their activities', nist: 'AT-2', type: 'administrative', auto: 'huntress', autoCheck: 'sat_completion' },
      { code: 'AT.L2-3.2.2', title: 'Role-Based Training', desc: 'Ensure personnel are trained to carry out assigned security-related duties', nist: 'AT-3', type: 'administrative', auto: 'huntress', autoCheck: 'sat_completion' },
      { code: 'AT.L2-3.2.3', title: 'Insider Threat Awareness', desc: 'Provide security awareness training on recognizing and reporting potential indicators of insider threat', nist: 'AT-2(2)', type: 'administrative' },
    ]},
    { code: 'AU', title: 'Audit and Accountability', controls: [
      { code: 'AU.L2-3.3.1', title: 'System Auditing', desc: 'Create and retain system audit logs and records', nist: 'AU-2', type: 'technical', auto: 'huntress', autoCheck: 'siem_logging' },
      { code: 'AU.L2-3.3.2', title: 'User Accountability', desc: 'Ensure actions of individual system users can be uniquely traced to those users', nist: 'AU-3', type: 'technical' },
      { code: 'AU.L2-3.3.4', title: 'Audit Failure Alerting', desc: 'Alert in the event of an audit logging process failure', nist: 'AU-5', type: 'technical' },
      { code: 'AU.L2-3.3.5', title: 'Audit Correlation', desc: 'Correlate audit record review, analysis, and reporting for investigation', nist: 'AU-6', type: 'technical', auto: 'huntress', autoCheck: 'soc_monitoring' },
      { code: 'AU.L2-3.3.6', title: 'Reduction & Reporting', desc: 'Provide audit record reduction and report generation to support analysis', nist: 'AU-7', type: 'technical' },
      { code: 'AU.L2-3.3.7', title: 'Authoritative Time Source', desc: 'Provide a system capability that compares and synchronizes internal system clocks', nist: 'AU-8', type: 'technical', auto: 'ncentral', autoCheck: 'ntp_sync' },
      { code: 'AU.L2-3.3.8', title: 'Audit Protection', desc: 'Protect audit information and audit logging tools from unauthorized access, modification, and deletion', nist: 'AU-9', type: 'technical' },
      { code: 'AU.L2-3.3.9', title: 'Audit Management', desc: 'Limit management of audit logging functionality to a subset of privileged users', nist: 'AU-9(4)', type: 'administrative' },
    ]},
    { code: 'CM', title: 'Configuration Management', controls: [
      { code: 'CM.L2-3.4.1', title: 'System Baselining', desc: 'Establish and maintain baseline configurations and inventories of systems', nist: 'CM-2', type: 'administrative' },
      { code: 'CM.L2-3.4.2', title: 'Security Configuration Enforcement', desc: 'Establish and enforce security configuration settings for IT products', nist: 'CM-6', type: 'technical', auto: 'ncentral', autoCheck: 'patch_compliance' },
      { code: 'CM.L2-3.4.3', title: 'System Change Management', desc: 'Track, review, approve, or disapprove, and log changes to systems', nist: 'CM-3', type: 'administrative' },
      { code: 'CM.L2-3.4.4', title: 'Security Impact Analysis', desc: 'Analyze the security impact of changes prior to implementation', nist: 'CM-4', type: 'administrative' },
      { code: 'CM.L2-3.4.5', title: 'Access Restrictions for Change', desc: 'Define, document, approve, and enforce access restrictions associated with changes', nist: 'CM-5', type: 'administrative' },
      { code: 'CM.L2-3.4.6', title: 'Least Functionality', desc: 'Employ the principle of least functionality by configuring systems to provide only essential capabilities', nist: 'CM-7', type: 'technical', severity: 'high', auto: 'nodeware', autoCheck: 'open_ports' },
      { code: 'CM.L2-3.4.7', title: 'Nonessential Functionality', desc: 'Restrict, disable, or prevent the use of nonessential programs, functions, ports, protocols, and services', nist: 'CM-7(1)', type: 'technical' },
      { code: 'CM.L2-3.4.8', title: 'Application Execution Policy', desc: 'Apply deny-by-exception (blacklisting) policy to prevent the use of unauthorized software', nist: 'CM-7(4)', type: 'technical' },
      { code: 'CM.L2-3.4.9', title: 'User-Installed Software', desc: 'Control and monitor user-installed software', nist: 'CM-11', type: 'technical' },
    ]},
    { code: 'IA', title: 'Identification and Authentication', controls: [
      { code: 'IA.L2-3.5.1', title: 'Identification', desc: 'Identify system users, processes acting on behalf of users, and devices', nist: 'IA-2', type: 'technical' },
      { code: 'IA.L2-3.5.2', title: 'Authentication', desc: 'Authenticate (or verify) the identities of users, processes, or devices as a prerequisite to access', nist: 'IA-2', type: 'technical' },
      { code: 'IA.L2-3.5.3', title: 'Multifactor Authentication', desc: 'Use multifactor authentication for local and network access to privileged accounts and for network access to non-privileged accounts', nist: 'IA-2(1)', type: 'technical', severity: 'critical', auto: 'duo', autoCheck: 'mfa_enrolled' },
      { code: 'IA.L2-3.5.4', title: 'Replay-Resistant Authentication', desc: 'Employ replay-resistant authentication mechanisms for network access to privileged and non-privileged accounts', nist: 'IA-2(8)', type: 'technical' },
      { code: 'IA.L2-3.5.7', title: 'Password Complexity', desc: 'Enforce minimum password complexity and change of characters when new passwords are created', nist: 'IA-5(1)', type: 'technical', auto: 'm365', autoCheck: 'password_policy' },
      { code: 'IA.L2-3.5.8', title: 'Password Reuse', desc: 'Prohibit password reuse for a specified number of generations', nist: 'IA-5(1)', type: 'technical' },
      { code: 'IA.L2-3.5.9', title: 'Temporary Passwords', desc: 'Allow temporary password use for system logons with an immediate change to a permanent password', nist: 'IA-5(1)', type: 'technical' },
      { code: 'IA.L2-3.5.10', title: 'Cryptographic Password Storage', desc: 'Store and transmit only cryptographically-protected passwords', nist: 'IA-5(2)', type: 'technical' },
      { code: 'IA.L2-3.5.11', title: 'Obscure Feedback', desc: 'Obscure feedback of authentication information', nist: 'IA-6', type: 'technical' },
    ]},
    { code: 'IR', title: 'Incident Response', controls: [
      { code: 'IR.L2-3.6.1', title: 'Incident Handling', desc: 'Establish an operational incident-handling capability including preparation, detection, analysis, containment, recovery, and user response', nist: 'IR-2', type: 'administrative' },
      { code: 'IR.L2-3.6.2', title: 'Incident Reporting', desc: 'Track, document, and report incidents to designated officials and/or authorities', nist: 'IR-6', type: 'administrative' },
      { code: 'IR.L2-3.6.3', title: 'Incident Response Testing', desc: 'Test the organizational incident response capability', nist: 'IR-3', type: 'administrative' },
    ]},
    { code: 'MA', title: 'Maintenance', controls: [
      { code: 'MA.L2-3.7.1', title: 'System Maintenance', desc: 'Perform maintenance on organizational systems', nist: 'MA-2', type: 'administrative' },
      { code: 'MA.L2-3.7.2', title: 'Maintenance Tools', desc: 'Provide controls on the tools, techniques, mechanisms, and personnel used to conduct maintenance', nist: 'MA-3', type: 'administrative' },
      { code: 'MA.L2-3.7.5', title: 'Nonlocal Maintenance', desc: 'Require multifactor authentication for nonlocal maintenance sessions and terminate when complete', nist: 'MA-4', type: 'technical' },
      { code: 'MA.L2-3.7.6', title: 'Maintenance Personnel', desc: 'Supervise the maintenance activities of maintenance personnel without required access authorization', nist: 'MA-5', type: 'administrative' },
    ]},
    { code: 'MP', title: 'Media Protection', controls: [
      { code: 'MP.L2-3.8.1', title: 'Media Protection', desc: 'Protect system media containing CUI, both paper and digital', nist: 'MP-2', type: 'physical' },
      { code: 'MP.L2-3.8.2', title: 'Media Access', desc: 'Limit access to CUI on system media to authorized users', nist: 'MP-2', type: 'physical' },
      { code: 'MP.L2-3.8.3', title: 'Media Sanitization', desc: 'Sanitize or destroy system media containing CUI before disposal or reuse', nist: 'MP-6', type: 'physical', severity: 'high' },
      { code: 'MP.L2-3.8.4', title: 'Media Markings', desc: 'Mark media with necessary CUI markings and distribution limitations', nist: 'MP-3', type: 'administrative' },
      { code: 'MP.L2-3.8.5', title: 'Media Accountability', desc: 'Control access to media containing CUI and maintain accountability during transport', nist: 'MP-5', type: 'physical' },
      { code: 'MP.L2-3.8.6', title: 'Portable Storage Encryption', desc: 'Implement cryptographic mechanisms to protect the confidentiality of CUI stored on digital media during transport', nist: 'MP-5(4)', type: 'technical', severity: 'critical' },
    ]},
    { code: 'PS', title: 'Personnel Security', controls: [
      { code: 'PS.L2-3.9.1', title: 'Screen Individuals', desc: 'Screen individuals prior to authorizing access to systems containing CUI', nist: 'PS-3', type: 'administrative', severity: 'high' },
      { code: 'PS.L2-3.9.2', title: 'Personnel Actions', desc: 'Ensure CUI and systems containing CUI are protected during and after personnel actions such as terminations and transfers', nist: 'PS-4', type: 'administrative', severity: 'high' },
    ]},
    { code: 'PE', title: 'Physical Protection', controls: [
      { code: 'PE.L2-3.10.1', title: 'Physical Access Limitation', desc: 'Limit physical access to systems, equipment, and operating environments to authorized individuals', nist: 'PE-2', type: 'physical', severity: 'high' },
      { code: 'PE.L2-3.10.2', title: 'Physical Access Protection', desc: 'Protect and monitor the physical facility and support infrastructure', nist: 'PE-6', type: 'physical' },
      { code: 'PE.L2-3.10.3', title: 'Escort Visitors', desc: 'Escort visitors and monitor visitor activity', nist: 'PE-7', type: 'physical' },
      { code: 'PE.L2-3.10.4', title: 'Physical Access Logs', desc: 'Maintain audit logs of physical access', nist: 'PE-8', type: 'physical' },
      { code: 'PE.L2-3.10.5', title: 'Physical Access Devices', desc: 'Control and manage physical access devices', nist: 'PE-3', type: 'physical' },
      { code: 'PE.L2-3.10.6', title: 'Alternative Work Sites', desc: 'Enforce safeguarding measures for CUI at alternate work sites', nist: 'PE-17', type: 'administrative' },
    ]},
    { code: 'RA', title: 'Risk Assessment', controls: [
      { code: 'RA.L2-3.11.1', title: 'Risk Assessments', desc: 'Periodically assess the risk to operations, assets, and individuals from system operation and CUI processing', nist: 'RA-3', type: 'administrative' },
      { code: 'RA.L2-3.11.2', title: 'Vulnerability Scan', desc: 'Scan for vulnerabilities in systems and applications periodically and when new vulnerabilities are identified', nist: 'RA-5', type: 'technical', severity: 'high', auto: 'nodeware', autoCheck: 'vuln_scan' },
      { code: 'RA.L2-3.11.3', title: 'Vulnerability Remediation', desc: 'Remediate vulnerabilities in accordance with risk assessments', nist: 'RA-5(5)', type: 'technical', auto: 'nodeware', autoCheck: 'vuln_remediation' },
    ]},
    { code: 'CA', title: 'Security Assessment', controls: [
      { code: 'CA.L2-3.12.1', title: 'Security Control Assessment', desc: 'Periodically assess the security controls in systems to determine if the controls are effective', nist: 'CA-2', type: 'administrative' },
      { code: 'CA.L2-3.12.2', title: 'Plan of Action', desc: 'Develop and implement plans of action designed to correct deficiencies and reduce vulnerabilities', nist: 'CA-5', type: 'administrative' },
      { code: 'CA.L2-3.12.3', title: 'Security Control Monitoring', desc: 'Monitor security controls on an ongoing basis to ensure the continued effectiveness of the controls', nist: 'CA-7', type: 'administrative' },
      { code: 'CA.L2-3.12.4', title: 'System Security Plan', desc: 'Develop, document, and periodically update system security plans', nist: 'PL-2', type: 'administrative' },
    ]},
    { code: 'SC', title: 'System and Communications Protection', controls: [
      { code: 'SC.L2-3.13.1', title: 'Boundary Protection', desc: 'Monitor, control, and protect communications at external and key internal boundaries', nist: 'SC-7', type: 'technical', severity: 'critical', auto: 'nodeware', autoCheck: 'firewall_present' },
      { code: 'SC.L2-3.13.2', title: 'Security Architecture', desc: 'Employ architectural designs, software development techniques, and systems engineering principles that promote effective information security', nist: 'SA-8', type: 'administrative' },
      { code: 'SC.L2-3.13.5', title: 'Public Access Separation', desc: 'Implement subnetworks for publicly accessible system components that are physically or logically separated from internal networks', nist: 'SC-7(5)', type: 'technical' },
      { code: 'SC.L2-3.13.6', title: 'Network Communication by Exception', desc: 'Deny network communications traffic by default and allow by exception', nist: 'SC-7(5)', type: 'technical' },
      { code: 'SC.L2-3.13.8', title: 'CUI Encryption in Transit', desc: 'Implement cryptographic mechanisms to prevent unauthorized disclosure of CUI during transmission', nist: 'SC-8', type: 'technical', severity: 'critical' },
      { code: 'SC.L2-3.13.11', title: 'CUI Encryption at Rest', desc: 'Employ FIPS-validated cryptography when used to protect the confidentiality of CUI', nist: 'SC-13', type: 'technical', severity: 'critical', auto: 'ncentral', autoCheck: 'disk_encryption' },
      { code: 'SC.L2-3.13.15', title: 'Session Authenticity', desc: 'Protect the authenticity of communications sessions', nist: 'SC-23', type: 'technical' },
      { code: 'SC.L2-3.13.16', title: 'CUI at Rest', desc: 'Protect the confidentiality of CUI at rest', nist: 'SC-28', type: 'technical', severity: 'critical' },
    ]},
    { code: 'SI', title: 'System and Information Integrity', controls: [
      { code: 'SI.L2-3.14.1', title: 'Flaw Remediation', desc: 'Identify, report, and correct system flaws in a timely manner', nist: 'SI-2', type: 'technical', auto: 'ncentral', autoCheck: 'patch_compliance' },
      { code: 'SI.L2-3.14.2', title: 'Malicious Code Protection', desc: 'Provide protection from malicious code at designated locations within systems', nist: 'SI-3', type: 'technical', severity: 'high', auto: 'huntress', autoCheck: 'edr_active' },
      { code: 'SI.L2-3.14.3', title: 'Security Alerts & Advisories', desc: 'Monitor system security alerts and advisories and take action in response', nist: 'SI-5', type: 'administrative', auto: 'huntress', autoCheck: 'soc_monitoring' },
      { code: 'SI.L2-3.14.4', title: 'Update Malicious Code Protection', desc: 'Update malicious code protection mechanisms when new releases are available', nist: 'SI-3', type: 'technical', auto: 'huntress', autoCheck: 'edr_active' },
      { code: 'SI.L2-3.14.5', title: 'System & File Scanning', desc: 'Perform periodic and real-time scans and scan files from external sources', nist: 'SI-3', type: 'technical' },
      { code: 'SI.L2-3.14.6', title: 'Inbound/Outbound Monitoring', desc: 'Monitor systems including inbound and outbound communications traffic', nist: 'SI-4', type: 'technical', auto: 'huntress', autoCheck: 'soc_monitoring' },
      { code: 'SI.L2-3.14.7', title: 'Unauthorized Use Detection', desc: 'Identify unauthorized use of systems', nist: 'SI-4', type: 'technical' },
    ]},
  ],
};

const HIPAA_DATA: FrameworkDef = {
  name: 'HIPAA Security Rule', shortName: 'HIPAA', version: '2013',
  description: 'Health Insurance Portability and Accountability Act Security Rule — administrative, physical, and technical safeguards for electronic Protected Health Information (ePHI).',
  nistMappingEnabled: false, metadata: { publisher: 'HHS Office for Civil Rights', effectiveDate: '2013-03-26' },
  areas: [
    { code: 'ADM', title: 'Administrative Safeguards (§164.308)', controls: [
      { code: '164.308(a)(1)', title: 'Security Management Process', desc: 'Implement policies and procedures to prevent, detect, contain, and correct security violations', type: 'administrative' },
      { code: '164.308(a)(1)(ii)(A)', title: 'Risk Analysis', desc: 'Conduct an accurate and thorough assessment of potential risks and vulnerabilities to ePHI', type: 'administrative' },
      { code: '164.308(a)(1)(ii)(B)', title: 'Risk Management', desc: 'Implement security measures to reduce risks and vulnerabilities to a reasonable and appropriate level', type: 'administrative' },
      { code: '164.308(a)(1)(ii)(C)', title: 'Sanction Policy', desc: 'Apply appropriate sanctions against workforce members who fail to comply with security policies', type: 'administrative' },
      { code: '164.308(a)(1)(ii)(D)', title: 'Information System Activity Review', desc: 'Implement procedures to regularly review records of information system activity', type: 'administrative', auto: 'huntress', autoCheck: 'siem_logging' },
      { code: '164.308(a)(2)', title: 'Assigned Security Responsibility', desc: 'Identify the security official responsible for developing and implementing security policies', type: 'administrative' },
      { code: '164.308(a)(3)', title: 'Workforce Security', desc: 'Implement policies and procedures to ensure all workforce members have appropriate access to ePHI', type: 'administrative' },
      { code: '164.308(a)(3)(ii)(A)', title: 'Authorization and/or Supervision', desc: 'Implement procedures for authorization and/or supervision of workforce members who work with ePHI', type: 'administrative' },
      { code: '164.308(a)(3)(ii)(B)', title: 'Workforce Clearance Procedure', desc: 'Implement procedures to determine that access to ePHI is appropriate', type: 'administrative' },
      { code: '164.308(a)(3)(ii)(C)', title: 'Termination Procedures', desc: 'Implement procedures for terminating access to ePHI when employment ends', type: 'administrative', severity: 'high' },
      { code: '164.308(a)(4)', title: 'Information Access Management', desc: 'Implement policies and procedures for authorizing access to ePHI', type: 'administrative' },
      { code: '164.308(a)(5)', title: 'Security Awareness and Training', desc: 'Implement a security awareness and training program for all workforce members', type: 'administrative', auto: 'huntress', autoCheck: 'sat_completion' },
      { code: '164.308(a)(5)(ii)(A)', title: 'Security Reminders', desc: 'Periodic security updates and reminders', type: 'administrative' },
      { code: '164.308(a)(5)(ii)(B)', title: 'Protection from Malicious Software', desc: 'Procedures for guarding against, detecting, and reporting malicious software', type: 'administrative', auto: 'huntress', autoCheck: 'edr_active' },
      { code: '164.308(a)(5)(ii)(C)', title: 'Log-in Monitoring', desc: 'Procedures for monitoring log-in attempts and reporting discrepancies', type: 'technical', auto: 'huntress', autoCheck: 'soc_monitoring' },
      { code: '164.308(a)(5)(ii)(D)', title: 'Password Management', desc: 'Procedures for creating, changing, and safeguarding passwords', type: 'technical', auto: 'm365', autoCheck: 'password_policy' },
      { code: '164.308(a)(6)', title: 'Security Incident Procedures', desc: 'Implement policies and procedures to address security incidents', type: 'administrative' },
      { code: '164.308(a)(6)(ii)', title: 'Response and Reporting', desc: 'Identify and respond to suspected or known security incidents; mitigate harmful effects; document incidents and outcomes', type: 'administrative' },
      { code: '164.308(a)(7)', title: 'Contingency Plan', desc: 'Establish policies and procedures for responding to an emergency or other occurrence that damages ePHI systems', type: 'administrative' },
      { code: '164.308(a)(7)(ii)(A)', title: 'Data Backup Plan', desc: 'Establish and implement procedures to create and maintain retrievable exact copies of ePHI', type: 'technical', severity: 'critical' },
      { code: '164.308(a)(7)(ii)(B)', title: 'Disaster Recovery Plan', desc: 'Establish procedures to restore any loss of data', type: 'administrative', severity: 'critical' },
      { code: '164.308(a)(7)(ii)(C)', title: 'Emergency Mode Operation Plan', desc: 'Establish procedures to enable continuation of critical business processes', type: 'administrative', severity: 'high' },
      { code: '164.308(a)(8)', title: 'Evaluation', desc: 'Perform periodic technical and non-technical evaluations based on standards', type: 'administrative' },
      { code: '164.308(b)(1)', title: 'Business Associate Contracts', desc: 'Written contract or arrangement with business associate that creates satisfactory assurances for ePHI safeguards', type: 'administrative', severity: 'high' },
    ]},
    { code: 'PHY', title: 'Physical Safeguards (§164.310)', controls: [
      { code: '164.310(a)(1)', title: 'Facility Access Controls', desc: 'Implement policies and procedures to limit physical access to electronic information systems', type: 'physical', severity: 'high' },
      { code: '164.310(a)(2)(ii)', title: 'Facility Security Plan', desc: 'Implement policies and procedures to safeguard the facility and equipment from unauthorized physical access', type: 'physical' },
      { code: '164.310(a)(2)(iii)', title: 'Access Control and Validation', desc: 'Implement procedures to control and validate a person\'s access to facilities based on their role', type: 'physical' },
      { code: '164.310(a)(2)(iv)', title: 'Maintenance Records', desc: 'Implement policies and procedures to document repairs and modifications to the physical components of a facility', type: 'physical' },
      { code: '164.310(b)', title: 'Workstation Use', desc: 'Implement policies and procedures that specify the proper functions to be performed and physical attributes of the surroundings of a workstation', type: 'physical' },
      { code: '164.310(c)', title: 'Workstation Security', desc: 'Implement physical safeguards for all workstations that access ePHI', type: 'physical' },
      { code: '164.310(d)(1)', title: 'Device and Media Controls', desc: 'Implement policies and procedures governing the receipt and removal of hardware and electronic media containing ePHI', type: 'physical' },
      { code: '164.310(d)(2)(i)', title: 'Disposal', desc: 'Implement policies and procedures to address the final disposition of ePHI and/or the hardware or electronic media on which it is stored', type: 'physical', severity: 'high' },
      { code: '164.310(d)(2)(ii)', title: 'Media Re-Use', desc: 'Implement procedures for removal of ePHI from electronic media before the media are made available for re-use', type: 'physical' },
    ]},
    { code: 'TECH', title: 'Technical Safeguards (§164.312)', controls: [
      { code: '164.312(a)(1)', title: 'Access Control', desc: 'Implement technical policies and procedures for electronic information systems that maintain ePHI to allow access only to authorized persons', type: 'technical', severity: 'high' },
      { code: '164.312(a)(2)(i)', title: 'Unique User Identification', desc: 'Assign a unique name and/or number for identifying and tracking user identity', type: 'technical', auto: 'm365', autoCheck: 'unique_accounts' },
      { code: '164.312(a)(2)(ii)', title: 'Emergency Access Procedure', desc: 'Establish procedures for obtaining necessary ePHI during an emergency', type: 'administrative' },
      { code: '164.312(a)(2)(iii)', title: 'Automatic Logoff', desc: 'Implement electronic procedures that terminate an electronic session after a predetermined time of inactivity', type: 'technical', auto: 'ncentral', autoCheck: 'screen_lock_policy' },
      { code: '164.312(a)(2)(iv)', title: 'Encryption and Decryption', desc: 'Implement a mechanism to encrypt and decrypt ePHI', type: 'technical', severity: 'critical', auto: 'ncentral', autoCheck: 'disk_encryption' },
      { code: '164.312(b)', title: 'Audit Controls', desc: 'Implement hardware, software, and/or procedural mechanisms that record and examine activity in systems that contain or use ePHI', type: 'technical', auto: 'huntress', autoCheck: 'siem_logging' },
      { code: '164.312(c)(1)', title: 'Integrity', desc: 'Implement policies and procedures to protect ePHI from improper alteration or destruction', type: 'technical' },
      { code: '164.312(d)', title: 'Person or Entity Authentication', desc: 'Implement procedures to verify that a person or entity seeking access to ePHI is the one claimed', type: 'technical', auto: 'duo', autoCheck: 'mfa_enrolled' },
      { code: '164.312(e)(1)', title: 'Transmission Security', desc: 'Implement technical security measures to guard against unauthorized access to ePHI that is being transmitted over a network', type: 'technical', severity: 'critical' },
      { code: '164.312(e)(2)(ii)', title: 'Encryption', desc: 'Implement a mechanism to encrypt ePHI whenever deemed appropriate', type: 'technical', severity: 'critical' },
    ]},
    { code: 'BN', title: 'Breach Notification (§164.400)', controls: [
      { code: '164.404', title: 'Individual Notification', desc: 'Notify affected individuals within 60 days of discovery of a breach of unsecured PHI', type: 'administrative', severity: 'critical' },
      { code: '164.406', title: 'Media Notification', desc: 'If breach affects more than 500 residents of a state, notify prominent media outlets', type: 'administrative', severity: 'high' },
      { code: '164.408', title: 'HHS Notification', desc: 'Notify the Secretary of HHS. Breaches affecting 500+ individuals must be reported within 60 days', type: 'administrative', severity: 'critical' },
      { code: '164.410', title: 'Business Associate Notification', desc: 'Business associates must notify covered entities of breaches of unsecured PHI', type: 'administrative' },
      { code: '164.414', title: 'Burden of Proof', desc: 'Covered entity bears burden of demonstrating all required notifications were made or that the use/disclosure did not constitute a breach', type: 'administrative' },
    ]},
  ],
};

const PCI_DATA: FrameworkDef = {
  name: 'PCI-DSS', shortName: 'PCI-DSS', version: '4.0',
  description: 'Payment Card Industry Data Security Standard v4.0 — requirements for protecting cardholder data environments.',
  nistMappingEnabled: false, metadata: { publisher: 'PCI Security Standards Council', effectiveDate: '2024-03-31' },
  areas: [
    { code: 'REQ-1', title: 'Install and Maintain Network Security Controls', controls: [
      { code: '1.1', title: 'Network Security Policies', desc: 'Processes and mechanisms for installing and maintaining network security controls are defined and understood', type: 'administrative' },
      { code: '1.2', title: 'Network Security Controls (NSCs)', desc: 'Network security controls are configured and maintained', type: 'technical', severity: 'critical', auto: 'nodeware', autoCheck: 'firewall_present' },
      { code: '1.3', title: 'Network Access Restriction', desc: 'Network access to and from the cardholder data environment is restricted', type: 'technical', severity: 'critical' },
      { code: '1.4', title: 'Trusted/Untrusted Boundaries', desc: 'Network connections between trusted and untrusted networks are controlled', type: 'technical', severity: 'high' },
      { code: '1.5', title: 'Risk Mitigation', desc: 'Risks to the CDE from computing devices connecting to both untrusted networks and the CDE are mitigated', type: 'technical' },
    ]},
    { code: 'REQ-2', title: 'Apply Secure Configuration Standards', controls: [
      { code: '2.1', title: 'Secure Configuration Policies', desc: 'Processes and mechanisms for applying secure configurations to all system components are defined and understood', type: 'administrative' },
      { code: '2.2', title: 'System Configuration Standards', desc: 'System components are configured and managed securely', type: 'technical', severity: 'high', auto: 'ncentral', autoCheck: 'patch_compliance' },
      { code: '2.3', title: 'Wireless Security', desc: 'Wireless environments are configured and managed securely', type: 'technical' },
    ]},
    { code: 'REQ-3', title: 'Protect Stored Account Data', controls: [
      { code: '3.1', title: 'Data Retention Policies', desc: 'Processes and mechanisms for protecting stored account data are defined and understood', type: 'administrative' },
      { code: '3.2', title: 'Sensitive Authentication Data', desc: 'Storage of account data is kept to a minimum', type: 'administrative', severity: 'critical' },
      { code: '3.3', title: 'SAD Not Stored After Authorization', desc: 'Sensitive authentication data is not stored after authorization', type: 'technical', severity: 'critical' },
      { code: '3.4', title: 'PAN Access Restriction', desc: 'Access to displays of full PAN and ability to copy PAN is restricted', type: 'technical', severity: 'high' },
      { code: '3.5', title: 'PAN Secured Wherever Stored', desc: 'Primary account number is secured wherever it is stored', type: 'technical', severity: 'critical' },
      { code: '3.6', title: 'Cryptographic Key Management', desc: 'Cryptographic keys used to protect stored account data are secured', type: 'technical', severity: 'critical' },
    ]},
    { code: 'REQ-4', title: 'Protect Cardholder Data in Transit', controls: [
      { code: '4.1', title: 'Transmission Security Policies', desc: 'Processes and mechanisms for protecting cardholder data with strong cryptography during transmission are defined', type: 'administrative' },
      { code: '4.2', title: 'Strong Cryptography in Transit', desc: 'PAN is protected with strong cryptography during transmission over open, public networks', type: 'technical', severity: 'critical' },
    ]},
    { code: 'REQ-5', title: 'Protect from Malicious Software', controls: [
      { code: '5.1', title: 'Anti-Malware Policies', desc: 'Processes and mechanisms for protecting all systems and networks from malicious software are defined', type: 'administrative' },
      { code: '5.2', title: 'Anti-Malware Deployed', desc: 'Malicious software is prevented, or detected and addressed', type: 'technical', severity: 'high', auto: 'huntress', autoCheck: 'edr_active' },
      { code: '5.3', title: 'Anti-Malware Active and Maintained', desc: 'Anti-malware mechanisms and processes are active, maintained, and monitored', type: 'technical', auto: 'huntress', autoCheck: 'edr_active' },
      { code: '5.4', title: 'Anti-Phishing Mechanisms', desc: 'Anti-phishing mechanisms protect users against phishing attacks', type: 'technical', auto: 'huntress', autoCheck: 'sat_completion' },
    ]},
    { code: 'REQ-6', title: 'Develop and Maintain Secure Systems', controls: [
      { code: '6.1', title: 'Secure Development Policies', desc: 'Processes and mechanisms for developing and maintaining secure systems and software are defined', type: 'administrative' },
      { code: '6.2', title: 'Bespoke/Custom Software Security', desc: 'Bespoke and custom software are developed securely', type: 'technical' },
      { code: '6.3', title: 'Security Vulnerabilities Identified', desc: 'Security vulnerabilities are identified and addressed', type: 'technical', severity: 'high', auto: 'nodeware', autoCheck: 'vuln_scan' },
      { code: '6.4', title: 'Public-Facing Web Security', desc: 'Public-facing web applications are protected against attacks', type: 'technical' },
      { code: '6.5', title: 'Change Management', desc: 'Changes to all system components are managed securely', type: 'administrative' },
    ]},
    { code: 'REQ-7', title: 'Restrict Access to System Components', controls: [
      { code: '7.1', title: 'Access Control Policies', desc: 'Processes and mechanisms for restricting access to system components and cardholder data are defined', type: 'administrative' },
      { code: '7.2', title: 'Access to System Components', desc: 'Access to system components and data is appropriately defined and assigned', type: 'technical', auto: 'm365', autoCheck: 'least_privilege' },
      { code: '7.3', title: 'Access Control Systems', desc: 'Access to system components and data is managed via an access control system', type: 'technical' },
    ]},
    { code: 'REQ-8', title: 'Identify Users and Authenticate Access', controls: [
      { code: '8.1', title: 'Identity Policies', desc: 'Processes and mechanisms for identifying users and authenticating access are defined', type: 'administrative' },
      { code: '8.2', title: 'User Identification', desc: 'User identification and related accounts for users and administrators are strictly managed', type: 'technical', auto: 'm365', autoCheck: 'unique_accounts' },
      { code: '8.3', title: 'Strong Authentication', desc: 'Strong authentication for users and administrators is established and managed', type: 'technical', severity: 'critical', auto: 'duo', autoCheck: 'mfa_enrolled' },
      { code: '8.4', title: 'MFA Implementation', desc: 'Multi-factor authentication is implemented to secure access into the CDE', type: 'technical', severity: 'critical', auto: 'duo', autoCheck: 'mfa_enrolled' },
      { code: '8.5', title: 'MFA Systems Configured', desc: 'Multi-factor authentication systems are configured to prevent misuse', type: 'technical' },
      { code: '8.6', title: 'Application/System Account Management', desc: 'Use of application and system accounts and associated authentication factors is strictly managed', type: 'administrative' },
    ]},
    { code: 'REQ-9', title: 'Restrict Physical Access to Cardholder Data', controls: [
      { code: '9.1', title: 'Physical Access Policies', desc: 'Processes and mechanisms for restricting physical access to cardholder data are defined', type: 'physical' },
      { code: '9.2', title: 'Physical Access Controls', desc: 'Physical access controls manage entry into facilities and systems containing cardholder data', type: 'physical', severity: 'high' },
      { code: '9.3', title: 'Physical Access Authorization', desc: 'Physical access for personnel and visitors is authorized and managed', type: 'physical' },
      { code: '9.4', title: 'Media Protection', desc: 'Media with cardholder data is securely stored, accessed, distributed, and destroyed', type: 'physical', severity: 'high' },
      { code: '9.5', title: 'POI Device Protection', desc: 'Point of interaction devices are protected from tampering and unauthorized substitution', type: 'physical', severity: 'critical' },
    ]},
    { code: 'REQ-10', title: 'Log and Monitor All Access', controls: [
      { code: '10.1', title: 'Logging Policies', desc: 'Processes and mechanisms for logging and monitoring all access to system components and cardholder data are defined', type: 'administrative' },
      { code: '10.2', title: 'Audit Logs Implemented', desc: 'Audit logs are implemented to support detection of anomalies and suspicious activity', type: 'technical', severity: 'high', auto: 'huntress', autoCheck: 'siem_logging' },
      { code: '10.3', title: 'Audit Logs Protected', desc: 'Audit logs are protected from destruction and unauthorized modifications', type: 'technical' },
      { code: '10.4', title: 'Audit Logs Reviewed', desc: 'Audit logs are reviewed to identify anomalies or suspicious activity', type: 'technical', auto: 'huntress', autoCheck: 'soc_monitoring' },
      { code: '10.5', title: 'Audit Log History Retained', desc: 'Audit log history is retained and available for analysis', type: 'administrative' },
      { code: '10.6', title: 'Time Synchronization', desc: 'Time-synchronization mechanisms support consistent time settings across all systems', type: 'technical', auto: 'ncentral', autoCheck: 'ntp_sync' },
      { code: '10.7', title: 'Detection of Failures', desc: 'Failures of critical security control systems are detected, reported, and responded to promptly', type: 'technical' },
    ]},
    { code: 'REQ-11', title: 'Test Security of Systems and Networks Regularly', controls: [
      { code: '11.1', title: 'Testing Policies', desc: 'Processes and mechanisms for regularly testing security of systems and networks are defined', type: 'administrative' },
      { code: '11.2', title: 'Wireless Access Points', desc: 'Authorized and unauthorized wireless access points are managed', type: 'technical' },
      { code: '11.3', title: 'Vulnerability Scans and Penetration Tests', desc: 'External and internal vulnerabilities are regularly identified, prioritized, and addressed', type: 'technical', severity: 'high', auto: 'nodeware', autoCheck: 'vuln_scan' },
      { code: '11.4', title: 'Penetration Testing', desc: 'External and internal penetration testing is regularly performed', type: 'technical', severity: 'high' },
      { code: '11.5', title: 'Intrusion Detection', desc: 'Network intrusions and unexpected file changes are detected and responded to', type: 'technical', auto: 'huntress', autoCheck: 'edr_active' },
      { code: '11.6', title: 'Payment Page Security', desc: 'Unauthorized changes on payment pages are detected and responded to', type: 'technical' },
    ]},
    { code: 'REQ-12', title: 'Support Security with Organizational Policies', controls: [
      { code: '12.1', title: 'Information Security Policy', desc: 'A comprehensive information security policy that governs and provides direction for protection of all CDE assets is known and current', type: 'administrative' },
      { code: '12.2', title: 'Acceptable Use Policies', desc: 'Acceptable use policies for end-user technologies are defined and implemented', type: 'administrative' },
      { code: '12.3', title: 'CDE Risks Addressed', desc: 'Risks to the cardholder data environment are formally identified, evaluated, and managed', type: 'administrative' },
      { code: '12.4', title: 'PCI DSS Compliance Managed', desc: 'PCI DSS compliance is managed', type: 'administrative' },
      { code: '12.5', title: 'PCI DSS Scope Documented', desc: 'PCI DSS scope is documented and validated', type: 'administrative' },
      { code: '12.6', title: 'Security Awareness Education', desc: 'Security awareness education is an ongoing activity', type: 'administrative', auto: 'huntress', autoCheck: 'sat_completion' },
      { code: '12.8', title: 'Third-Party Service Providers', desc: 'Risk to information assets associated with third-party service provider relationships is managed', type: 'administrative' },
      { code: '12.9', title: 'Service Provider Acknowledgement', desc: 'Third-party service providers support PCI DSS compliance of their customers', type: 'administrative' },
      { code: '12.10', title: 'Incident Response Plan', desc: 'Security incidents and suspected security incidents are responded to immediately', type: 'administrative', severity: 'high' },
    ]},
  ],
};

// CJIS seed data inline
async function seedCJIS(db: any, tenantId: string) {
  const [fw] = await db.insert(complianceFrameworks).values({
    tenantId, name: 'CJIS Security Policy', shortName: 'CJIS', version: '6.0',
    description: 'FBI Criminal Justice Information Services Security Policy — establishes minimum security requirements for protecting Criminal Justice Information (CJI).',
    source: 'built_in', nistMappingEnabled: true,
    metadata: { publisher: 'FBI CJIS Division', effectiveDate: '2022-10-01' },
  }).returning();

  const areas = [
    { code: 'PA-1', title: 'Information Exchange Agreements', controls: [
      { code: '5.1.1', title: 'Information Exchange Agreements', desc: 'Agreements must be in place before exchanging CJI', nist: 'SA-9', type: 'administrative' },
      { code: '5.1.2', title: 'Management Control Agreements', desc: 'Outsourced CJI handling requires MCA', nist: 'SA-9', type: 'administrative' },
      { code: '5.1.3', title: 'Outsourcing Standards', desc: 'Contractors must meet same security requirements', nist: 'SA-9', type: 'administrative' },
      { code: '5.1.4', title: 'Secondary Dissemination', desc: 'CJI shared beyond receiving agency must be documented', nist: 'AC-21', type: 'administrative' },
    ]},
    { code: 'PA-2', title: 'Security Awareness Training', controls: [
      { code: '5.2.1', title: 'Awareness Topics', desc: 'Training must cover CJI handling, incident reporting, password security', nist: 'AT-2', type: 'administrative', auto: 'huntress', autoCheck: 'sat_completion' },
      { code: '5.2.2', title: 'Training Records', desc: 'All training records documented and maintained', nist: 'AT-4', type: 'administrative', auto: 'huntress', autoCheck: 'sat_records' },
      { code: '5.2.3', title: 'Training Frequency', desc: 'Within 6 months of assignment, refresher annually', nist: 'AT-2', type: 'administrative', auto: 'huntress', autoCheck: 'sat_frequency' },
    ]},
    { code: 'PA-3', title: 'Incident Response', controls: [
      { code: '5.3.1', title: 'Reporting', desc: 'Security incidents involving CJI reported to FBI CJIS ISO', nist: 'IR-6', type: 'administrative' },
      { code: '5.3.2', title: 'Management', desc: 'Documented incident handling procedures', nist: 'IR-4', type: 'administrative' },
      { code: '5.3.3', title: 'Evidence Collection', desc: 'Evidence preservation and chain of custody', nist: 'IR-4', type: 'administrative' },
      { code: '5.3.4', title: 'IR Training', desc: 'Incident response training for CJI personnel', nist: 'IR-2', type: 'administrative' },
      { code: '5.3.5', title: 'Monitoring', desc: 'Ongoing tracking of security incidents', nist: 'IR-5', type: 'administrative' },
    ]},
    { code: 'PA-4', title: 'Auditing and Accountability', controls: [
      { code: '5.4.1', title: 'Auditable Events', desc: 'Log login attempts, data access, admin actions', nist: 'AU-2', type: 'technical', auto: 'huntress', autoCheck: 'siem_logging' },
      { code: '5.4.2', title: 'Content of Audit Records', desc: 'Logs include who, what, when, where, outcome', nist: 'AU-3', type: 'technical', auto: 'huntress', autoCheck: 'siem_log_content' },
      { code: '5.4.3', title: 'Audit Monitoring', desc: 'Regular review and analysis of audit records', nist: 'AU-6', type: 'technical', auto: 'huntress', autoCheck: 'soc_monitoring' },
      { code: '5.4.4', title: 'Time Stamps', desc: 'System clocks synchronized via NTP', nist: 'AU-8', type: 'technical', auto: 'ncentral', autoCheck: 'ntp_sync' },
      { code: '5.4.5', title: 'Protection of Audit Info', desc: 'Audit logs protected from unauthorized access', nist: 'AU-9', type: 'technical' },
      { code: '5.4.6', title: 'Audit Record Retention', desc: 'Minimum 365-day retention', nist: 'AU-11', type: 'administrative', auto: 'huntress', autoCheck: 'log_retention' },
    ]},
    { code: 'PA-5', title: 'Access Control', controls: [
      { code: '5.5.1', title: 'Account Management', desc: 'Formal account management for CJI systems', nist: 'AC-2', type: 'administrative', auto: 'm365', autoCheck: 'account_management' },
      { code: '5.5.2', title: 'Access Enforcement', desc: 'Systems enforce approved authorizations', nist: 'AC-3', type: 'technical', auto: 'm365', autoCheck: 'conditional_access' },
      { code: '5.5.3', title: 'Unsuccessful Login Attempts', desc: 'Lockout after 5 failed attempts', nist: 'AC-7', type: 'technical', auto: 'm365', autoCheck: 'lockout_policy' },
      { code: '5.5.4', title: 'System Use Notification', desc: 'Login banner before CJI system access', nist: 'AC-8', type: 'technical', auto: 'ncentral', autoCheck: 'login_banner' },
      { code: '5.5.5', title: 'Session Lock', desc: '30-minute inactivity lock', nist: 'AC-11', type: 'technical', auto: 'ncentral', autoCheck: 'screen_lock_policy' },
      { code: '5.5.6', title: 'Remote Access', desc: 'Encrypted VPN with MFA for remote CJI', nist: 'AC-17', type: 'technical', severity: 'high' },
      { code: '5.5.7', title: 'Wireless Access', desc: 'Additional controls for wireless CJI networks', nist: 'AC-18', type: 'technical' },
      { code: '5.5.8', title: 'Mobile Device Access', desc: 'MDM required for CJI-capable mobile devices', nist: 'AC-19', type: 'technical' },
      { code: '5.5.9', title: 'Least Privilege', desc: 'Minimum access necessary for job function', nist: 'AC-6', type: 'administrative', auto: 'm365', autoCheck: 'least_privilege' },
      { code: '5.5.10', title: 'Role-Based Access', desc: 'Access control based on defined roles', nist: 'AC-3', type: 'administrative' },
    ]},
    { code: 'PA-6', title: 'Identification and Authentication', controls: [
      { code: '5.6.1', title: 'Unique Identification', desc: 'Each user has unique ID, no shared accounts', nist: 'IA-4', type: 'administrative', auto: 'm365', autoCheck: 'unique_accounts' },
      { code: '5.6.2', title: 'Authentication Policy', desc: 'Documented authentication requirements', nist: 'IA-1', type: 'administrative' },
      { code: '5.6.3', title: 'Standard Authentication', desc: '8+ chars, complexity, 90-day expiration', nist: 'IA-5', type: 'technical', auto: 'm365', autoCheck: 'password_policy' },
      { code: '5.6.4', title: 'Advanced Authentication (MFA)', desc: 'MFA for remote/elevated CJI access', nist: 'IA-2', type: 'technical', severity: 'critical', auto: 'duo', autoCheck: 'mfa_enrolled' },
      { code: '5.6.5', title: 'Identifier Management', desc: 'Disable after 90 days inactive', nist: 'IA-4', type: 'administrative', auto: 'm365', autoCheck: 'inactive_accounts' },
      { code: '5.6.6', title: 'Authenticator Management', desc: 'Password storage and revocation procedures', nist: 'IA-5', type: 'administrative' },
      { code: '5.6.7', title: 'Authenticator Feedback', desc: 'Mask passwords during entry', nist: 'IA-6', type: 'technical' },
    ]},
    { code: 'PA-7', title: 'Configuration Management', controls: [
      { code: '5.7.1', title: 'Access Restrictions for Changes', desc: 'Only authorized personnel modify configs', nist: 'CM-5', type: 'administrative' },
      { code: '5.7.2', title: 'Least Functionality', desc: 'Minimum services, ports, protocols', nist: 'CM-7', type: 'technical', severity: 'high', auto: 'nodeware', autoCheck: 'open_ports' },
      { code: '5.7.3', title: 'Network Diagram', desc: 'Current network topology documented', nist: 'CM-2', type: 'administrative' },
      { code: '5.7.4', title: 'Configuration Documentation', desc: 'Config docs protected from disclosure', nist: 'CM-6', type: 'administrative' },
    ]},
    { code: 'PA-8', title: 'Media Protection', controls: [
      { code: '5.8.1', title: 'Media Storage and Access', desc: 'CJI media in controlled area', nist: 'MP-2', type: 'physical' },
      { code: '5.8.2', title: 'Media Transport', desc: 'Encrypted during physical transport', nist: 'MP-5', type: 'physical' },
      { code: '5.8.3', title: 'Electronic Media Sanitization', desc: 'Proper sanitization before disposal', nist: 'MP-6', type: 'physical', severity: 'high' },
      { code: '5.8.4', title: 'Physical Media Disposal', desc: 'Physical destruction of CJI media', nist: 'MP-6', type: 'physical' },
    ]},
    { code: 'PA-9', title: 'Physical Protection', controls: [
      { code: '5.9.1', title: 'Physically Secure Location', desc: 'CJI systems in access-controlled areas', nist: 'PE-3', type: 'physical', severity: 'high' },
      { code: '5.9.2', title: 'Physical Access Authorizations', desc: 'Maintain authorized personnel list', nist: 'PE-2', type: 'administrative' },
      { code: '5.9.3', title: 'Physical Access Control', desc: 'Card readers, locks, guards for CJI areas', nist: 'PE-3', type: 'physical' },
      { code: '5.9.4', title: 'Display Access Control', desc: 'Screens positioned to prevent viewing', nist: 'PE-5', type: 'physical' },
      { code: '5.9.5', title: 'Monitoring Physical Access', desc: 'Cameras, logs, or guards', nist: 'PE-6', type: 'physical' },
      { code: '5.9.6', title: 'Visitor Control', desc: 'Escort and log visitors', nist: 'PE-7', type: 'physical' },
      { code: '5.9.7', title: 'Delivery and Removal', desc: 'Equipment movement tracked', nist: 'PE-16', type: 'physical' },
    ]},
    { code: 'PA-10', title: 'Systems and Communications Protection', controls: [
      { code: '5.10.1', title: 'Boundary Protection', desc: 'Firewalls/DMZs at CJI network boundaries', nist: 'SC-7', type: 'technical', severity: 'critical', auto: 'nodeware', autoCheck: 'firewall_present' },
      { code: '5.10.2', title: 'Encryption in Transit', desc: 'FIPS 140-2 encryption for CJI in transit', nist: 'SC-13', type: 'technical', severity: 'critical' },
      { code: '5.10.3', title: 'Intrusion Detection', desc: 'IDS/IPS on CJI network segments', nist: 'SI-4', type: 'technical', severity: 'high', auto: 'huntress', autoCheck: 'edr_active' },
      { code: '5.10.4', title: 'VoIP Security', desc: 'VoIP carrying CJI meets encryption requirements', nist: 'SC-7', type: 'technical' },
      { code: '5.10.5', title: 'Cloud Computing', desc: 'Cloud services must meet all CJIS requirements', nist: 'SC-7', type: 'technical', severity: 'high' },
      { code: '5.10.6', title: 'Encryption at Rest', desc: 'FIPS 140-2 encryption for stored CJI', nist: 'SC-28', type: 'technical', severity: 'critical', auto: 'ncentral', autoCheck: 'disk_encryption' },
      { code: '5.10.7', title: 'PKI Requirements', desc: 'Approved CAs for CJI system certs', nist: 'SC-17', type: 'technical' },
    ]},
    { code: 'PA-11', title: 'Formal Audits', controls: [
      { code: '5.11.1', title: 'FBI CJIS Division Audits', desc: 'Triennial FBI audit', nist: 'CA-7', type: 'administrative' },
      { code: '5.11.2', title: 'CSA Audits', desc: 'State CSA audit program', nist: 'CA-2', type: 'administrative' },
      { code: '5.11.3', title: 'Special Security Inquiries', desc: 'Investigation-triggered audits', nist: 'CA-2', type: 'administrative' },
    ]},
    { code: 'PA-12', title: 'Personnel Security', controls: [
      { code: '5.12.1', title: 'Personnel Screening', desc: 'Fingerprint background check before CJI access', nist: 'PS-3', type: 'administrative', severity: 'critical' },
      { code: '5.12.2', title: 'Contractor Screening', desc: 'Same screening for contractor personnel', nist: 'PS-3', type: 'administrative', severity: 'critical' },
      { code: '5.12.3', title: 'Personnel Termination', desc: 'Immediate CJI access revocation on separation', nist: 'PS-4', type: 'administrative', severity: 'high' },
      { code: '5.12.4', title: 'Personnel Transfer', desc: 'Review access on role change', nist: 'PS-5', type: 'administrative' },
      { code: '5.12.5', title: 'Personnel Sanctions', desc: 'Sanctions for security violations', nist: 'PS-8', type: 'administrative' },
    ]},
    { code: 'PA-13', title: 'Mobile Devices', controls: [
      { code: '5.13.1', title: 'Wireless Communications', desc: 'WPA2/WPA3 for CJI wireless', nist: 'AC-18', type: 'technical' },
      { code: '5.13.2', title: 'MDM Requirements', desc: 'MDM required for CJI mobile devices', nist: 'AC-19', type: 'technical', severity: 'high' },
      { code: '5.13.3', title: 'BYOD Policy', desc: 'Personal devices enrolled in MDM with separation', nist: 'AC-19', type: 'administrative' },
      { code: '5.13.4', title: 'Risk Mitigations', desc: 'Disable Bluetooth, restrict WiFi connections', nist: 'AC-18', type: 'technical' },
    ]},
  ];

  let totalControls = 0;
  for (let i = 0; i < areas.length; i++) {
    const area = areas[i];
    const [pa] = await db.insert(compliancePolicyAreas).values({
      tenantId, frameworkId: fw.id, code: area.code, title: area.title, sortOrder: i,
    }).returning();

    for (let j = 0; j < area.controls.length; j++) {
      const c = area.controls[j] as any;
      await db.insert(complianceControls).values({
        tenantId, frameworkId: fw.id, policyAreaId: pa.id,
        controlCode: c.code, title: c.title, description: c.desc,
        nistMapping: c.nist, severity: c.severity || 'medium',
        controlType: c.type, assessmentMethod: c.type === 'technical' ? 'test' : 'examine',
        automationSource: c.auto || null,
        automationCheck: c.autoCheck || null,
        sortOrder: j,
      });
      totalControls++;
    }
  }

  return { message: `CJIS Security Policy v6.0 imported`, frameworkId: fw.id, policyAreas: areas.length, controlCount: totalControls };
}

export async function complianceRoutes(fastify: FastifyInstance) {

  // ── Frameworks CRUD ──────────────────────────────────────────────

  fastify.get('/api/v1/compliance/frameworks', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const frameworks = await fastify.db.select().from(complianceFrameworks)
      .where(and(eq(complianceFrameworks.tenantId, request.tenantId), eq(complianceFrameworks.isActive, true)))
      .orderBy(complianceFrameworks.name);

    // Get counts per framework
    const result = [];
    for (const fw of frameworks) {
      const [controlCount] = await fastify.db.select({ count: count() }).from(complianceControls)
        .where(eq(complianceControls.frameworkId, fw.id));
      const [areaCount] = await fastify.db.select({ count: count() }).from(compliancePolicyAreas)
        .where(eq(compliancePolicyAreas.frameworkId, fw.id));
      const [scopeCount] = await fastify.db.select({ count: count() }).from(complianceCustomerScopes)
        .where(and(eq(complianceCustomerScopes.frameworkId, fw.id), eq(complianceCustomerScopes.status, 'active')));
      result.push({ ...fw, controlCount: controlCount?.count ?? 0, policyAreaCount: areaCount?.count ?? 0, customerCount: scopeCount?.count ?? 0 });
    }
    return result;
  });

  fastify.get('/api/v1/compliance/frameworks/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [framework] = await fastify.db.select().from(complianceFrameworks)
      .where(and(eq(complianceFrameworks.id, id), eq(complianceFrameworks.tenantId, request.tenantId))).limit(1);
    if (!framework) throw new NotFoundError('Framework', id);

    const areas = await fastify.db.select().from(compliancePolicyAreas)
      .where(eq(compliancePolicyAreas.frameworkId, id)).orderBy(asc(compliancePolicyAreas.sortOrder));

    const controls = await fastify.db.select().from(complianceControls)
      .where(eq(complianceControls.frameworkId, id)).orderBy(asc(complianceControls.sortOrder));

    return { ...framework, policyAreas: areas, controls };
  });

  fastify.post('/api/v1/compliance/frameworks', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;
    const [framework] = await fastify.db.insert(complianceFrameworks).values({
      tenantId: request.tenantId,
      name: body.name,
      shortName: body.shortName,
      version: body.version,
      description: body.description,
      source: body.source || 'custom',
      nistMappingEnabled: body.nistMappingEnabled || false,
      metadata: body.metadata,
    }).returning();
    reply.code(201);
    return framework;
  });

  fastify.patch('/api/v1/compliance/frameworks/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.name !== undefined) updates.name = body.name;
    if (body.shortName !== undefined) updates.shortName = body.shortName;
    if (body.version !== undefined) updates.version = body.version;
    if (body.description !== undefined) updates.description = body.description;
    if (body.nistMappingEnabled !== undefined) updates.nistMappingEnabled = body.nistMappingEnabled;
    if (body.metadata !== undefined) updates.metadata = body.metadata;

    const [updated] = await fastify.db.update(complianceFrameworks).set(updates)
      .where(and(eq(complianceFrameworks.id, id), eq(complianceFrameworks.tenantId, request.tenantId))).returning();
    return updated;
  });

  fastify.delete('/api/v1/compliance/frameworks/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.update(complianceFrameworks).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(complianceFrameworks.id, id), eq(complianceFrameworks.tenantId, request.tenantId)));
    return { deleted: true };
  });

  // ── Seed built-in framework ──────────────────────────────────────

  fastify.post('/api/v1/compliance/frameworks/seed/:type', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { type } = request.params as { type: string };
    if (!['cjis', 'cmmc', 'hipaa', 'pci'].includes(type)) {
      return { error: 'Unknown framework type. Supported: cjis, cmmc, hipaa, pci' };
    }

    // Check if already exists
    const shortNames: Record<string, string> = { cjis: 'CJIS', cmmc: 'CMMC', hipaa: 'HIPAA', pci: 'PCI-DSS' };
    const shortName = shortNames[type];
    const [existing] = await fastify.db.select({ id: complianceFrameworks.id })
      .from(complianceFrameworks)
      .where(and(eq(complianceFrameworks.tenantId, request.tenantId), eq(complianceFrameworks.shortName, shortName)))
      .limit(1);
    if (existing) return { message: `${shortName} framework already exists`, frameworkId: existing.id, controlCount: 0 };

    if (type === 'cjis') return seedCJIS(fastify.db, request.tenantId);
    if (type === 'cmmc') return seedFrameworkGeneric(fastify.db, request.tenantId, CMMC_DATA);
    if (type === 'hipaa') return seedFrameworkGeneric(fastify.db, request.tenantId, HIPAA_DATA);
    if (type === 'pci') return seedFrameworkGeneric(fastify.db, request.tenantId, PCI_DATA);
    return { error: 'Unknown type' };
  });

  // ── Framework Controls ───────────────────────────────────────────

  fastify.get('/api/v1/compliance/frameworks/:id/controls', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const areas = await fastify.db.select().from(compliancePolicyAreas)
      .where(eq(compliancePolicyAreas.frameworkId, id)).orderBy(asc(compliancePolicyAreas.sortOrder));

    const controls = await fastify.db.select().from(complianceControls)
      .where(eq(complianceControls.frameworkId, id)).orderBy(asc(complianceControls.sortOrder));

    // Group controls by policy area
    return areas.map(area => ({
      ...area,
      controls: controls.filter(c => c.policyAreaId === area.id),
    }));
  });

  fastify.post('/api/v1/compliance/frameworks/:id/controls', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const [control] = await fastify.db.insert(complianceControls).values({
      tenantId: request.tenantId,
      frameworkId: id,
      policyAreaId: body.policyAreaId,
      controlCode: body.controlCode,
      title: body.title,
      description: body.description,
      guidance: body.guidance,
      nistMapping: body.nistMapping,
      severity: body.severity || 'medium',
      controlType: body.controlType || 'technical',
      assessmentMethod: body.assessmentMethod || 'examine',
      sortOrder: body.sortOrder || 0,
      metadata: body.metadata,
    }).returning();
    reply.code(201);
    return control;
  });

  // ── Customer Scoping ─────────────────────────────────────────────

  fastify.get('/api/v1/compliance/scoped-customers', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const scopes = await fastify.db.select().from(complianceCustomerScopes)
      .where(and(eq(complianceCustomerScopes.tenantId, request.tenantId), eq(complianceCustomerScopes.status, 'active')));

    const customerIds = [...new Set(scopes.map(s => s.customerId))];
    if (customerIds.length === 0) return [];

    const custs = await fastify.db.select({ id: customers.id, name: customers.name, status: customers.status })
      .from(customers).where(inArray(customers.id, customerIds));

    const frameworks = await fastify.db.select().from(complianceFrameworks)
      .where(eq(complianceFrameworks.tenantId, request.tenantId));
    const fwMap = new Map(frameworks.map(f => [f.id, f]));

    return custs.map(c => ({
      ...c,
      scopes: scopes.filter(s => s.customerId === c.id).map(s => ({
        ...s,
        frameworkName: fwMap.get(s.frameworkId)?.name,
        frameworkShortName: fwMap.get(s.frameworkId)?.shortName,
      })),
    }));
  });

  fastify.get('/api/v1/compliance/customers/:customerId/scopes', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { customerId } = request.params as { customerId: string };
    const scopes = await fastify.db.select().from(complianceCustomerScopes)
      .where(and(eq(complianceCustomerScopes.tenantId, request.tenantId), eq(complianceCustomerScopes.customerId, customerId)));

    const frameworks = await fastify.db.select().from(complianceFrameworks)
      .where(eq(complianceFrameworks.tenantId, request.tenantId));
    const fwMap = new Map(frameworks.map(f => [f.id, f]));

    return scopes.map(s => ({
      ...s,
      frameworkName: fwMap.get(s.frameworkId)?.name,
      frameworkShortName: fwMap.get(s.frameworkId)?.shortName,
    }));
  });

  fastify.post('/api/v1/compliance/customers/:customerId/scopes', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const body = request.body as any;

    const [scope] = await fastify.db.insert(complianceCustomerScopes).values({
      tenantId: request.tenantId,
      customerId,
      frameworkId: body.frameworkId,
      scopeSource: body.scopeSource || 'manual',
      status: 'active',
      effectiveDate: body.effectiveDate,
      reviewDate: body.reviewDate,
      notes: body.notes,
    }).returning();

    // Auto-create control statuses for this customer+framework
    const controls = await fastify.db.select().from(complianceControls)
      .where(eq(complianceControls.frameworkId, body.frameworkId));

    for (const control of controls) {
      await fastify.db.insert(complianceControlStatuses).values({
        tenantId: request.tenantId,
        customerId,
        frameworkId: body.frameworkId,
        controlId: control.id,
        status: 'not_assessed',
      }).onConflictDoNothing();
    }

    reply.code(201);
    return scope;
  });

  fastify.delete('/api/v1/compliance/customers/:customerId/scopes/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id, customerId } = request.params as { id: string; customerId: string };

    // Get scope to find frameworkId
    const [scope] = await fastify.db.select().from(complianceCustomerScopes)
      .where(and(eq(complianceCustomerScopes.id, id), eq(complianceCustomerScopes.tenantId, request.tenantId))).limit(1);

    await fastify.db.delete(complianceCustomerScopes)
      .where(and(eq(complianceCustomerScopes.id, id), eq(complianceCustomerScopes.tenantId, request.tenantId)));

    // Clean up live control statuses for this customer+framework
    if (scope) {
      await fastify.db.delete(complianceControlStatuses)
        .where(and(eq(complianceControlStatuses.customerId, customerId), eq(complianceControlStatuses.frameworkId, scope.frameworkId)));
    }

    return { deleted: true };
  });

  // ── Customer Compliance Summary ──────────────────────────────────

  fastify.get('/api/v1/compliance/customers/:customerId/summary', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { customerId } = request.params as { customerId: string };

    const scopes = await fastify.db.select().from(complianceCustomerScopes)
      .where(and(eq(complianceCustomerScopes.tenantId, request.tenantId), eq(complianceCustomerScopes.customerId, customerId), eq(complianceCustomerScopes.status, 'active')));

    const frameworks = await fastify.db.select().from(complianceFrameworks)
      .where(eq(complianceFrameworks.tenantId, request.tenantId));
    const fwMap = new Map(frameworks.map(f => [f.id, f]));

    const result = [];
    for (const scope of scopes) {
      const statuses = await fastify.db.select({ status: complianceControlStatuses.status })
        .from(complianceControlStatuses)
        .where(and(eq(complianceControlStatuses.customerId, customerId), eq(complianceControlStatuses.frameworkId, scope.frameworkId)));

      const total = statuses.length;
      const compliant = statuses.filter(s => s.status === 'compliant').length;
      const nonCompliant = statuses.filter(s => s.status === 'non_compliant').length;
      const partial = statuses.filter(s => s.status === 'partial').length;
      const notAssessed = statuses.filter(s => s.status === 'not_assessed').length;
      const na = statuses.filter(s => s.status === 'not_applicable').length;
      const assessed = total - notAssessed;
      const score = assessed > 0 ? Math.round(((compliant + na) / (assessed)) * 100) : 0;

      const [poamCount] = await fastify.db.select({ count: count() }).from(compliancePoamItems)
        .where(and(eq(compliancePoamItems.customerId, customerId), eq(compliancePoamItems.frameworkId, scope.frameworkId), sql`${compliancePoamItems.status} != 'completed'`));

      const [riskCount] = await fastify.db.select({ count: count() }).from(complianceRiskItems)
        .where(and(eq(complianceRiskItems.customerId, customerId), sql`${complianceRiskItems.status} IN ('open', 'mitigating')`));

      // Latest assessment
      const [latestAssessment] = await fastify.db.select({ id: complianceAssessments.id, title: complianceAssessments.title, status: complianceAssessments.status, overallScore: complianceAssessments.overallScore, completedAt: complianceAssessments.completedAt })
        .from(complianceAssessments)
        .where(and(eq(complianceAssessments.customerId, customerId), eq(complianceAssessments.frameworkId, scope.frameworkId)))
        .orderBy(desc(complianceAssessments.createdAt)).limit(1);

      result.push({
        frameworkId: scope.frameworkId,
        frameworkName: fwMap.get(scope.frameworkId)?.name,
        frameworkShortName: fwMap.get(scope.frameworkId)?.shortName,
        scope,
        score,
        total, compliant, nonCompliant, partial, notAssessed, na,
        openPoamItems: poamCount?.count ?? 0,
        openRisks: riskCount?.count ?? 0,
        latestAssessment,
      });
    }
    return result;
  });

  // ── Assessments ──────────────────────────────────────────────────

  fastify.get('/api/v1/compliance/assessments', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(complianceAssessments.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(complianceAssessments.customerId, params.customerId));
    if (params.frameworkId) conditions.push(eq(complianceAssessments.frameworkId, params.frameworkId));
    if (params.status) conditions.push(eq(complianceAssessments.status, params.status));

    const assessments = await fastify.db.select().from(complianceAssessments)
      .where(and(...conditions)).orderBy(desc(complianceAssessments.createdAt)).limit(50);

    // Enrich with customer and framework names
    const custIds = [...new Set(assessments.map(a => a.customerId))];
    const fwIds = [...new Set(assessments.map(a => a.frameworkId))];
    const custs = custIds.length > 0 ? await fastify.db.select({ id: customers.id, name: customers.name }).from(customers).where(inArray(customers.id, custIds)) : [];
    const fws = fwIds.length > 0 ? await fastify.db.select({ id: complianceFrameworks.id, name: complianceFrameworks.name, shortName: complianceFrameworks.shortName }).from(complianceFrameworks).where(inArray(complianceFrameworks.id, fwIds)) : [];

    const custMap = new Map(custs.map(c => [c.id, c.name]));
    const fwMap = new Map(fws.map(f => [f.id, f]));

    return assessments.map(a => ({
      ...a,
      customerName: custMap.get(a.customerId),
      frameworkName: fwMap.get(a.frameworkId)?.name,
      frameworkShortName: fwMap.get(a.frameworkId)?.shortName,
    }));
  });

  fastify.get('/api/v1/compliance/assessments/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [assessment] = await fastify.db.select().from(complianceAssessments)
      .where(and(eq(complianceAssessments.id, id), eq(complianceAssessments.tenantId, request.tenantId))).limit(1);
    if (!assessment) throw new NotFoundError('Assessment', id);

    const items = await fastify.db.select().from(complianceAssessmentItems)
      .where(eq(complianceAssessmentItems.assessmentId, id));

    // Get controls for enrichment
    const controlIds = items.map(i => i.controlId);
    const controls = controlIds.length > 0
      ? await fastify.db.select().from(complianceControls).where(inArray(complianceControls.id, controlIds))
      : [];
    const controlMap = new Map(controls.map(c => [c.id, c]));

    const areas = await fastify.db.select().from(compliancePolicyAreas)
      .where(eq(compliancePolicyAreas.frameworkId, assessment.frameworkId)).orderBy(asc(compliancePolicyAreas.sortOrder));

    const enrichedItems = items.map(i => ({
      ...i,
      control: controlMap.get(i.controlId),
    }));

    return { ...assessment, items: enrichedItems, policyAreas: areas };
  });

  fastify.post('/api/v1/compliance/assessments', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;

    const [assessment] = await fastify.db.insert(complianceAssessments).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      frameworkId: body.frameworkId,
      title: body.title,
      assessmentType: body.assessmentType || 'baseline',
      status: 'in_progress',
      assessorId: request.user.sub,
      startedAt: new Date(),
      dueDate: body.dueDate,
    }).returning();

    // Auto-populate items from framework controls
    const controls = await fastify.db.select().from(complianceControls)
      .where(eq(complianceControls.frameworkId, body.frameworkId));

    for (const control of controls) {
      await fastify.db.insert(complianceAssessmentItems).values({
        tenantId: request.tenantId,
        assessmentId: assessment.id,
        controlId: control.id,
        status: 'not_assessed',
      });
    }

    await fastify.db.insert(complianceActivityLog).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      entityType: 'assessment',
      entityId: assessment.id,
      action: 'created',
      actorType: 'user',
      actorId: request.user.sub,
      description: `Assessment created: ${assessment.title}`,
    });

    reply.code(201);
    return { ...assessment, itemCount: controls.length };
  });

  // Update assessment item
  fastify.patch('/api/v1/compliance/assessment-items/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.findings !== undefined) updates.findings = body.findings;
    if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
    if (body.assignedToContact !== undefined) updates.assignedToContact = body.assignedToContact;
    if (body.questionForContact !== undefined) updates.questionForContact = body.questionForContact;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
    if (body.status && body.status !== 'not_assessed') {
      updates.lastReviewedAt = new Date();
      updates.reviewedBy = request.user.sub;
    }

    const [updated] = await fastify.db.update(complianceAssessmentItems).set(updates)
      .where(and(eq(complianceAssessmentItems.id, id), eq(complianceAssessmentItems.tenantId, request.tenantId))).returning();
    return updated;
  });

  // Bulk update assessment items
  fastify.put('/api/v1/compliance/assessments/:id/items/bulk', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { items } = request.body as { items: Array<{ id: string; status: string; notes?: string }> };

    for (const item of items) {
      const updates: Record<string, unknown> = { status: item.status, updatedAt: new Date() };
      if (item.notes !== undefined) updates.notes = item.notes;
      if (item.status !== 'not_assessed') {
        updates.lastReviewedAt = new Date();
        updates.reviewedBy = request.user.sub;
      }
      await fastify.db.update(complianceAssessmentItems).set(updates)
        .where(and(eq(complianceAssessmentItems.id, item.id), eq(complianceAssessmentItems.tenantId, request.tenantId)));
    }

    return { updated: items.length };
  });

  // Complete assessment
  fastify.post('/api/v1/compliance/assessments/:id/complete', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };

    const [assessment] = await fastify.db.select().from(complianceAssessments)
      .where(and(eq(complianceAssessments.id, id), eq(complianceAssessments.tenantId, request.tenantId))).limit(1);
    if (!assessment) throw new NotFoundError('Assessment', id);

    const items = await fastify.db.select().from(complianceAssessmentItems)
      .where(eq(complianceAssessmentItems.assessmentId, id));

    // Calculate score
    const assessed = items.filter(i => i.status !== 'not_assessed');
    const compliant = items.filter(i => i.status === 'compliant' || i.status === 'not_applicable');
    const score = assessed.length > 0 ? Math.round((compliant.length / assessed.length) * 100) : 0;

    // Update assessment
    await fastify.db.update(complianceAssessments).set({
      status: 'completed', completedAt: new Date(), overallScore: score, updatedAt: new Date(),
    }).where(eq(complianceAssessments.id, id));

    // Promote results to live control statuses
    for (const item of items) {
      if (item.status === 'not_assessed') continue;
      await fastify.db.update(complianceControlStatuses).set({
        status: item.status,
        notes: item.notes,
        lastReviewedAt: new Date(),
        lastAssessmentItemId: item.id,
        updatedAt: new Date(),
      }).where(and(
        eq(complianceControlStatuses.customerId, assessment.customerId),
        eq(complianceControlStatuses.controlId, item.controlId),
      ));
    }

    await fastify.db.insert(complianceActivityLog).values({
      tenantId: request.tenantId,
      customerId: assessment.customerId,
      entityType: 'assessment',
      entityId: id,
      action: 'completed',
      actorType: 'user',
      actorId: request.user.sub,
      description: `Assessment completed with score: ${score}%`,
    });

    return { score, assessed: assessed.length, total: items.length };
  });

  // Generate POA&M from assessment
  fastify.post('/api/v1/compliance/assessments/:id/generate-poam', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };

    const [assessment] = await fastify.db.select().from(complianceAssessments)
      .where(and(eq(complianceAssessments.id, id), eq(complianceAssessments.tenantId, request.tenantId))).limit(1);
    if (!assessment) throw new NotFoundError('Assessment', id);

    const items = await fastify.db.select().from(complianceAssessmentItems)
      .where(and(eq(complianceAssessmentItems.assessmentId, id), sql`${complianceAssessmentItems.status} IN ('non_compliant', 'partial')`));

    const controls = await fastify.db.select().from(complianceControls)
      .where(eq(complianceControls.frameworkId, assessment.frameworkId));
    const controlMap = new Map(controls.map(c => [c.id, c]));

    // Get next POA&M number
    const [maxNum] = await fastify.db.select({ max: sql<number>`COALESCE(MAX(poam_number), 0)` })
      .from(compliancePoamItems).where(eq(compliancePoamItems.tenantId, request.tenantId));
    let nextNum = (maxNum?.max ?? 0) + 1;

    let created = 0;
    for (const item of items) {
      const control = controlMap.get(item.controlId);
      if (!control) continue;

      // Check if POA&M already exists for this control+customer
      const [existing] = await fastify.db.select({ id: compliancePoamItems.id })
        .from(compliancePoamItems)
        .where(and(
          eq(compliancePoamItems.customerId, assessment.customerId),
          eq(compliancePoamItems.controlId, item.controlId),
          sql`${compliancePoamItems.status} != 'completed'`,
        )).limit(1);
      if (existing) continue;

      await fastify.db.insert(compliancePoamItems).values({
        tenantId: request.tenantId,
        customerId: assessment.customerId,
        frameworkId: assessment.frameworkId,
        controlId: item.controlId,
        assessmentId: id,
        poamNumber: nextNum++,
        finding: `${control.controlCode}: ${control.title} — ${item.status === 'non_compliant' ? 'Non-compliant' : 'Partially compliant'}`,
        riskLevel: control.severity === 'critical' ? 'critical' : control.severity === 'high' ? 'high' : 'medium',
        weakness: item.findings || item.notes || `Control ${control.controlCode} requires remediation`,
        status: 'open',
      });
      created++;
    }

    return { created, total: items.length };
  });

  // ── Control Statuses (live tracking) ────────────────────────────

  fastify.get('/api/v1/compliance/customers/:customerId/controls', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { customerId } = request.params as { customerId: string };
    const params = request.query as Record<string, string>;

    const conditions = [eq(complianceControlStatuses.tenantId, request.tenantId), eq(complianceControlStatuses.customerId, customerId)];
    if (params.frameworkId) conditions.push(eq(complianceControlStatuses.frameworkId, params.frameworkId));
    if (params.status) conditions.push(eq(complianceControlStatuses.status, params.status));

    const statuses = await fastify.db.select().from(complianceControlStatuses)
      .where(and(...conditions));

    const controlIds = statuses.map(s => s.controlId);
    const controls = controlIds.length > 0
      ? await fastify.db.select().from(complianceControls).where(inArray(complianceControls.id, controlIds))
      : [];
    const controlMap = new Map(controls.map(c => [c.id, c]));

    return statuses.map(s => ({ ...s, control: controlMap.get(s.controlId) }));
  });

  fastify.patch('/api/v1/compliance/control-statuses/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
    if (body.status) updates.lastReviewedAt = new Date();

    const [updated] = await fastify.db.update(complianceControlStatuses).set(updates)
      .where(and(eq(complianceControlStatuses.id, id), eq(complianceControlStatuses.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── POA&M ───────────────────────────────────────────────────────

  fastify.get('/api/v1/compliance/poam', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(compliancePoamItems.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(compliancePoamItems.customerId, params.customerId));
    if (params.status) conditions.push(eq(compliancePoamItems.status, params.status));

    const items = await fastify.db.select().from(compliancePoamItems)
      .where(and(...conditions)).orderBy(desc(compliancePoamItems.createdAt)).limit(100);

    return items;
  });

  fastify.post('/api/v1/compliance/poam', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;
    const [maxNum] = await fastify.db.select({ max: sql<number>`COALESCE(MAX(poam_number), 0)` })
      .from(compliancePoamItems).where(eq(compliancePoamItems.tenantId, request.tenantId));

    const [item] = await fastify.db.insert(compliancePoamItems).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      frameworkId: body.frameworkId,
      controlId: body.controlId,
      poamNumber: (maxNum?.max ?? 0) + 1,
      finding: body.finding,
      riskLevel: body.riskLevel || 'medium',
      weakness: body.weakness,
      remediationPlan: body.remediationPlan,
      responsibleParty: body.responsibleParty,
      scheduledStartDate: body.scheduledStartDate,
      scheduledEndDate: body.scheduledEndDate,
      status: 'open',
      notes: body.notes,
    }).returning();
    reply.code(201);
    return item;
  });

  fastify.patch('/api/v1/compliance/poam/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['finding', 'riskLevel', 'weakness', 'remediationPlan', 'responsibleParty', 'scheduledStartDate', 'scheduledEndDate', 'actualEndDate', 'milestones', 'status', 'ticketId', 'costEstimateCents', 'notes']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const [updated] = await fastify.db.update(compliancePoamItems).set(updates)
      .where(and(eq(compliancePoamItems.id, id), eq(compliancePoamItems.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── Risk Register ───────────────────────────────────────────────

  fastify.get('/api/v1/compliance/risks', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(complianceRiskItems.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(complianceRiskItems.customerId, params.customerId));
    if (params.status) conditions.push(eq(complianceRiskItems.status, params.status));

    return fastify.db.select().from(complianceRiskItems)
      .where(and(...conditions)).orderBy(desc(complianceRiskItems.riskScore)).limit(100);
  });

  fastify.post('/api/v1/compliance/risks', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;
    const [item] = await fastify.db.insert(complianceRiskItems).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      title: body.title,
      description: body.description,
      category: body.category,
      riskSource: body.riskSource || 'manual',
      likelihood: body.likelihood,
      impact: body.impact,
      riskScore: body.likelihood * body.impact,
      riskResponse: body.riskResponse || 'mitigate',
      responseDetails: body.responseDetails,
      status: 'open',
      ownerId: body.ownerId,
      controlId: body.controlId,
      reviewDate: body.reviewDate,
    }).returning();
    reply.code(201);
    return item;
  });

  fastify.patch('/api/v1/compliance/risks/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'description', 'category', 'riskSource', 'likelihood', 'impact', 'riskResponse', 'responseDetails', 'status', 'ownerId', 'controlId', 'poamId', 'reviewDate']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.likelihood !== undefined && body.impact !== undefined) {
      updates.riskScore = body.likelihood * body.impact;
    }
    if (body.status) updates.lastReviewedAt = new Date();

    const [updated] = await fastify.db.update(complianceRiskItems).set(updates)
      .where(and(eq(complianceRiskItems.id, id), eq(complianceRiskItems.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── Dashboard ───────────────────────────────────────────────────

  fastify.get('/api/v1/compliance/dashboard', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const tid = request.tenantId;

    const [scopedCustomers] = await fastify.db.select({ count: count() }).from(complianceCustomerScopes)
      .where(and(eq(complianceCustomerScopes.tenantId, tid), eq(complianceCustomerScopes.status, 'active')));

    const [totalFrameworks] = await fastify.db.select({ count: count() }).from(complianceFrameworks)
      .where(and(eq(complianceFrameworks.tenantId, tid), eq(complianceFrameworks.isActive, true)));

    const [openPoam] = await fastify.db.select({ count: count() }).from(compliancePoamItems)
      .where(and(eq(compliancePoamItems.tenantId, tid), sql`${compliancePoamItems.status} NOT IN ('completed', 'accepted_risk')`));

    const [openRisks] = await fastify.db.select({ count: count() }).from(complianceRiskItems)
      .where(and(eq(complianceRiskItems.tenantId, tid), sql`${complianceRiskItems.status} IN ('open', 'mitigating')`));

    const [totalAssessments] = await fastify.db.select({ count: count() }).from(complianceAssessments)
      .where(eq(complianceAssessments.tenantId, tid));

    const recentActivity = await fastify.db.select().from(complianceActivityLog)
      .where(eq(complianceActivityLog.tenantId, tid)).orderBy(desc(complianceActivityLog.createdAt)).limit(10);

    return {
      scopedCustomers: scopedCustomers?.count ?? 0,
      totalFrameworks: totalFrameworks?.count ?? 0,
      openPoamItems: openPoam?.count ?? 0,
      openRisks: openRisks?.count ?? 0,
      totalAssessments: totalAssessments?.count ?? 0,
      recentActivity,
    };
  });

  // ── Asset Scope Mapping ─────────────────────────────────────────

  fastify.get('/api/v1/compliance/customers/:customerId/scoped-assets', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { customerId } = request.params as { customerId: string };
    const params = request.query as Record<string, string>;
    const conditions = [eq(complianceScopedAssets.tenantId, request.tenantId), eq(complianceScopedAssets.customerId, customerId)];
    if (params.frameworkId) conditions.push(eq(complianceScopedAssets.frameworkId, params.frameworkId));

    const scoped = await fastify.db.select().from(complianceScopedAssets).where(and(...conditions));
    const assetIds = scoped.map(s => s.assetId);
    const assetList = assetIds.length > 0 ? await fastify.db.select({ id: assets.id, name: assets.name, assetType: assets.assetType, ipAddress: assets.ipAddress, osName: assets.osName })
      .from(assets).where(inArray(assets.id, assetIds)) : [];
    const assetMap = new Map(assetList.map(a => [a.id, a]));

    return scoped.map(s => ({ ...s, asset: assetMap.get(s.assetId) }));
  });

  fastify.post('/api/v1/compliance/customers/:customerId/scoped-assets', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const body = request.body as any;
    const assetIds = Array.isArray(body.assetIds) ? body.assetIds : [body.assetId];

    let created = 0;
    for (const assetId of assetIds) {
      try {
        await fastify.db.insert(complianceScopedAssets).values({
          tenantId: request.tenantId, customerId,
          frameworkId: body.frameworkId, assetId,
          networkZone: body.networkZone, justification: body.justification,
          addedBy: request.user.sub,
        }).onConflictDoNothing();
        created++;
      } catch { /* skip duplicates */ }
    }
    reply.code(201);
    return { created };
  });

  fastify.delete('/api/v1/compliance/scoped-assets/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(complianceScopedAssets)
      .where(and(eq(complianceScopedAssets.id, id), eq(complianceScopedAssets.tenantId, request.tenantId)));
    return { deleted: true };
  });

  // ── Personnel Screening ─────────────────────────────────────────

  fastify.get('/api/v1/compliance/personnel', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(compliancePersonnelScreening.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(compliancePersonnelScreening.customerId, params.customerId));
    if (params.status) conditions.push(eq(compliancePersonnelScreening.status, params.status));
    return fastify.db.select().from(compliancePersonnelScreening)
      .where(and(...conditions)).orderBy(desc(compliancePersonnelScreening.createdAt)).limit(100);
  });

  fastify.post('/api/v1/compliance/personnel', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;
    const [record] = await fastify.db.insert(compliancePersonnelScreening).values({
      tenantId: request.tenantId,
      customerId: body.customerId || null,
      contactId: body.contactId || null,
      userId: body.userId || null,
      personName: body.personName,
      personRole: body.personRole,
      screeningType: body.screeningType,
      status: body.status || 'pending',
      submittedDate: body.submittedDate,
      clearedDate: body.clearedDate,
      expirationDate: body.expirationDate,
      renewalDueDate: body.renewalDueDate,
      agencyOri: body.agencyOri,
      notes: body.notes,
      metadata: body.metadata,
    }).returning();
    reply.code(201);
    return record;
  });

  fastify.patch('/api/v1/compliance/personnel/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['personName', 'personRole', 'screeningType', 'status', 'submittedDate', 'clearedDate', 'expirationDate', 'renewalDueDate', 'agencyOri', 'documentStorageKey', 'notes', 'metadata']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const [updated] = await fastify.db.update(compliancePersonnelScreening).set(updates)
      .where(and(eq(compliancePersonnelScreening.id, id), eq(compliancePersonnelScreening.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── Training Records ────────────────────────────────────────────

  fastify.get('/api/v1/compliance/training', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(complianceTrainingRecords.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(complianceTrainingRecords.customerId, params.customerId));
    if (params.status) conditions.push(eq(complianceTrainingRecords.status, params.status));
    return fastify.db.select().from(complianceTrainingRecords)
      .where(and(...conditions)).orderBy(desc(complianceTrainingRecords.createdAt)).limit(200);
  });

  fastify.post('/api/v1/compliance/training', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;
    const [record] = await fastify.db.insert(complianceTrainingRecords).values({
      tenantId: request.tenantId,
      customerId: body.customerId || null,
      contactId: body.contactId || null,
      userId: body.userId || null,
      personName: body.personName,
      trainingType: body.trainingType,
      trainingProvider: body.trainingProvider,
      courseName: body.courseName,
      status: body.status || 'assigned',
      assignedDate: body.assignedDate || new Date().toISOString().split('T')[0],
      dueDate: body.dueDate,
      completedDate: body.completedDate,
      expirationDate: body.expirationDate,
      externalId: body.externalId,
      externalSource: body.externalSource,
      metadata: body.metadata,
    }).returning();
    reply.code(201);
    return record;
  });

  fastify.patch('/api/v1/compliance/training/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['personName', 'trainingType', 'trainingProvider', 'courseName', 'status', 'dueDate', 'completedDate', 'expirationDate', 'score', 'certificateStorageKey', 'externalId', 'externalSource', 'metadata', 'notes']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const [updated] = await fastify.db.update(complianceTrainingRecords).set(updates)
      .where(and(eq(complianceTrainingRecords.id, id), eq(complianceTrainingRecords.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── Vendors / Business Associates ───────────────────────────────

  fastify.get('/api/v1/compliance/vendors', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(complianceVendors.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(complianceVendors.customerId, params.customerId));
    if (params.status) conditions.push(eq(complianceVendors.status, params.status));
    return fastify.db.select().from(complianceVendors)
      .where(and(...conditions)).orderBy(complianceVendors.vendorName).limit(100);
  });

  fastify.post('/api/v1/compliance/vendors', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;
    const [vendor] = await fastify.db.insert(complianceVendors).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      vendorName: body.vendorName,
      vendorType: body.vendorType,
      contactName: body.contactName,
      contactEmail: body.contactEmail,
      contactPhone: body.contactPhone,
      servicesProvided: body.servicesProvided,
      dataAccess: body.dataAccess,
      agreementType: body.agreementType,
      agreementStatus: body.agreementStatus || 'none',
      agreementSignedDate: body.agreementSignedDate,
      agreementExpirationDate: body.agreementExpirationDate,
      complianceCertifications: body.complianceCertifications,
      riskLevel: body.riskLevel || 'medium',
      notes: body.notes,
    }).returning();
    reply.code(201);
    return vendor;
  });

  fastify.patch('/api/v1/compliance/vendors/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['vendorName', 'vendorType', 'contactName', 'contactEmail', 'contactPhone', 'servicesProvided', 'dataAccess', 'agreementType', 'agreementStatus', 'agreementSignedDate', 'agreementExpirationDate', 'agreementStorageKey', 'complianceCertifications', 'lastReviewDate', 'nextReviewDate', 'riskLevel', 'status', 'notes', 'metadata']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const [updated] = await fastify.db.update(complianceVendors).set(updates)
      .where(and(eq(complianceVendors.id, id), eq(complianceVendors.tenantId, request.tenantId))).returning();
    return updated;
  });

  fastify.delete('/api/v1/compliance/vendors/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.update(complianceVendors).set({ status: 'terminated', updatedAt: new Date() })
      .where(and(eq(complianceVendors.id, id), eq(complianceVendors.tenantId, request.tenantId)));
    return { deleted: true };
  });

  // ── Security Incidents / Breach Log ─────────────────────────────

  fastify.get('/api/v1/compliance/incidents', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(complianceIncidents.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(complianceIncidents.customerId, params.customerId));
    if (params.status) conditions.push(eq(complianceIncidents.status, params.status));
    return fastify.db.select().from(complianceIncidents)
      .where(and(...conditions)).orderBy(desc(complianceIncidents.createdAt)).limit(100);
  });

  fastify.post('/api/v1/compliance/incidents', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;
    const [maxNum] = await fastify.db.select({ max: sql<number>`COALESCE(MAX(incident_number), 0)` })
      .from(complianceIncidents).where(eq(complianceIncidents.tenantId, request.tenantId));

    const [incident] = await fastify.db.insert(complianceIncidents).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      incidentNumber: (maxNum?.max ?? 0) + 1,
      title: body.title,
      description: body.description,
      incidentType: body.incidentType,
      severity: body.severity || 'medium',
      dataTypes: body.dataTypes,
      affectedIndividuals: body.affectedIndividuals,
      discoveredAt: body.discoveredAt ? new Date(body.discoveredAt) : new Date(),
      status: 'open',
      leadInvestigator: body.leadInvestigator || request.user.sub,
    }).returning();

    await fastify.db.insert(complianceActivityLog).values({
      tenantId: request.tenantId,
      customerId: body.customerId,
      entityType: 'incident',
      entityId: incident.id,
      action: 'created',
      actorType: 'user',
      actorId: request.user.sub,
      description: `Security incident #${incident.incidentNumber}: ${incident.title}`,
    });

    reply.code(201);
    return incident;
  });

  fastify.patch('/api/v1/compliance/incidents/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'description', 'incidentType', 'severity', 'dataTypes', 'affectedSystems', 'affectedIndividuals', 'discoveredAt', 'reportedAt', 'containedAt', 'resolvedAt', 'reportedTo', 'breachNotification', 'rootCause', 'remediationActions', 'lessonsLearned', 'status', 'ticketId', 'leadInvestigator', 'metadata']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const [updated] = await fastify.db.update(complianceIncidents).set(updates)
      .where(and(eq(complianceIncidents.id, id), eq(complianceIncidents.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── Assessment Update ────────────────────────────────────────────

  fastify.patch('/api/v1/compliance/assessments/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'assessmentType', 'status', 'dueDate', 'summary', 'findings']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    const [updated] = await fastify.db.update(complianceAssessments).set(updates)
      .where(and(eq(complianceAssessments.id, id), eq(complianceAssessments.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── Evidence Update ─────────────────────────────────────────────

  fastify.patch('/api/v1/compliance/evidence/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'evidenceType', 'description', 'externalUrl', 'collectedAt', 'expiresAt', 'tags']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.reviewed) {
      updates.reviewedAt = new Date();
      updates.reviewedBy = request.user.sub;
    }
    const [updated] = await fastify.db.update(complianceEvidence).set(updates)
      .where(and(eq(complianceEvidence.id, id), eq(complianceEvidence.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── Scoped Asset Update ─────────────────────────────────────────

  fastify.patch('/api/v1/compliance/scoped-assets/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const updates: Record<string, unknown> = {};
    if (body.networkZone !== undefined) updates.networkZone = body.networkZone;
    if (body.justification !== undefined) updates.justification = body.justification;
    const [updated] = await fastify.db.update(complianceScopedAssets).set(updates)
      .where(and(eq(complianceScopedAssets.id, id), eq(complianceScopedAssets.tenantId, request.tenantId))).returning();
    return updated;
  });

  // ── Assessment DELETE ────────────────────────────────────────────

  fastify.delete('/api/v1/compliance/assessments/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [assessment] = await fastify.db.select().from(complianceAssessments)
      .where(and(eq(complianceAssessments.id, id), eq(complianceAssessments.tenantId, request.tenantId))).limit(1);
    if (!assessment) throw new NotFoundError('Assessment', id);
    if (assessment.status === 'completed') return { error: 'Cannot delete a completed assessment' };
    await fastify.db.delete(complianceAssessmentItems).where(eq(complianceAssessmentItems.assessmentId, id));
    await fastify.db.delete(complianceAssessments).where(eq(complianceAssessments.id, id));
    return { deleted: true };
  });

  // ── GET-by-ID endpoints ────────────────────────────────────────

  fastify.get('/api/v1/compliance/poam/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [item] = await fastify.db.select().from(compliancePoamItems)
      .where(and(eq(compliancePoamItems.id, id), eq(compliancePoamItems.tenantId, request.tenantId))).limit(1);
    if (!item) throw new NotFoundError('POA&M Item', id);
    return item;
  });

  fastify.get('/api/v1/compliance/risks/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [item] = await fastify.db.select().from(complianceRiskItems)
      .where(and(eq(complianceRiskItems.id, id), eq(complianceRiskItems.tenantId, request.tenantId))).limit(1);
    if (!item) throw new NotFoundError('Risk', id);
    return item;
  });

  fastify.get('/api/v1/compliance/personnel/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [item] = await fastify.db.select().from(compliancePersonnelScreening)
      .where(and(eq(compliancePersonnelScreening.id, id), eq(compliancePersonnelScreening.tenantId, request.tenantId))).limit(1);
    if (!item) throw new NotFoundError('Personnel Record', id);
    return item;
  });

  fastify.get('/api/v1/compliance/training/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [item] = await fastify.db.select().from(complianceTrainingRecords)
      .where(and(eq(complianceTrainingRecords.id, id), eq(complianceTrainingRecords.tenantId, request.tenantId))).limit(1);
    if (!item) throw new NotFoundError('Training Record', id);
    return item;
  });

  fastify.get('/api/v1/compliance/incidents/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [item] = await fastify.db.select().from(complianceIncidents)
      .where(and(eq(complianceIncidents.id, id), eq(complianceIncidents.tenantId, request.tenantId))).limit(1);
    if (!item) throw new NotFoundError('Incident', id);
    return item;
  });

  fastify.get('/api/v1/compliance/evidence/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [item] = await fastify.db.select().from(complianceEvidence)
      .where(and(eq(complianceEvidence.id, id), eq(complianceEvidence.tenantId, request.tenantId))).limit(1);
    if (!item) throw new NotFoundError('Evidence', id);
    const links = await fastify.db.select().from(complianceEvidenceControls)
      .where(eq(complianceEvidenceControls.evidenceId, id));
    return { ...item, controlLinks: links };
  });

  // ── Portal Compliance Endpoints ─────────────────────────────────

  fastify.get('/api/v1/portal/compliance/tasks', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (!(request as any).user?.cid) return [];
    const customerId = (request as any).user.cid;
    const contactId = (request as any).user.sub;

    // Get assessment items assigned to this contact
    const items = await fastify.db.select().from(complianceAssessmentItems)
      .where(and(eq(complianceAssessmentItems.tenantId, request.tenantId), eq(complianceAssessmentItems.assignedToContact, contactId)));

    const controlIds = items.map(i => i.controlId);
    const controls = controlIds.length > 0
      ? await fastify.db.select().from(complianceControls).where(inArray(complianceControls.id, controlIds))
      : [];
    const controlMap = new Map(controls.map(c => [c.id, c]));

    return items.map(i => ({
      id: i.id,
      controlCode: controlMap.get(i.controlId)?.controlCode,
      controlTitle: controlMap.get(i.controlId)?.title,
      question: i.questionForContact,
      status: i.status,
      dueDate: i.dueDate,
      response: i.responseFromContact,
      responseDate: i.responseDate,
    }));
  });

  fastify.patch('/api/v1/portal/compliance/tasks/:id', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (!(request as any).user?.cid) return { error: 'Not a portal user' };
    const { id } = request.params as { id: string };
    const body = request.body as { response: string };

    const [updated] = await fastify.db.update(complianceAssessmentItems).set({
      responseFromContact: body.response,
      responseDate: new Date(),
      updatedAt: new Date(),
    }).where(and(
      eq(complianceAssessmentItems.id, id),
      eq(complianceAssessmentItems.tenantId, request.tenantId),
      eq(complianceAssessmentItems.assignedToContact, (request as any).user.sub),
    )).returning();

    return updated || { error: 'Not found or not assigned to you' };
  });

  // Portal: Compliance dashboard for customer
  fastify.get('/api/v1/portal/compliance/dashboard', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (!(request as any).user?.cid) return { error: 'Not a portal user' };
    const customerId = (request as any).user.cid;
    const tenantId = request.tenantId;

    // Get compliance summary for this customer
    const scopes = await fastify.db.select().from(complianceCustomerScopes)
      .where(and(eq(complianceCustomerScopes.tenantId, tenantId), eq(complianceCustomerScopes.customerId, customerId), eq(complianceCustomerScopes.status, 'active')));

    const fws = await fastify.db.select().from(complianceFrameworks).where(eq(complianceFrameworks.tenantId, tenantId));
    const fwMap = new Map(fws.map(f => [f.id, f]));

    const frameworkScores = [];
    for (const scope of scopes) {
      const statuses = await fastify.db.select({ status: complianceControlStatuses.status })
        .from(complianceControlStatuses)
        .where(and(eq(complianceControlStatuses.customerId, customerId), eq(complianceControlStatuses.frameworkId, scope.frameworkId)));
      const total = statuses.length;
      const compliant = statuses.filter(s => s.status === 'compliant').length;
      const na = statuses.filter(s => s.status === 'not_applicable').length;
      const notAssessed = statuses.filter(s => s.status === 'not_assessed').length;
      const assessed = total - notAssessed;
      const score = assessed > 0 ? Math.round(((compliant + na) / assessed) * 100) : 0;
      frameworkScores.push({
        frameworkId: scope.frameworkId,
        frameworkName: fwMap.get(scope.frameworkId)?.name,
        frameworkShortName: fwMap.get(scope.frameworkId)?.shortName,
        score, total, compliant, assessed,
      });
    }

    const [openPoam] = await fastify.db.select({ count: count() }).from(compliancePoamItems)
      .where(and(eq(compliancePoamItems.customerId, customerId), sql`${compliancePoamItems.status} NOT IN ('completed', 'accepted_risk')`));

    return { frameworkScores, openPoamItems: openPoam?.count ?? 0 };
  });

  // Portal: Customer's assessments
  fastify.get('/api/v1/portal/compliance/assessments', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (!(request as any).user?.cid) return [];
    const customerId = (request as any).user.cid;
    return fastify.db.select().from(complianceAssessments)
      .where(and(eq(complianceAssessments.tenantId, request.tenantId), eq(complianceAssessments.customerId, customerId)))
      .orderBy(desc(complianceAssessments.createdAt)).limit(20);
  });

  // Portal: Customer's POA&M items
  fastify.get('/api/v1/portal/compliance/poam', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    if (!(request as any).user?.cid) return [];
    return fastify.db.select().from(compliancePoamItems)
      .where(and(eq(compliancePoamItems.tenantId, request.tenantId), eq(compliancePoamItems.customerId, (request as any).user.cid)))
      .orderBy(desc(compliancePoamItems.createdAt)).limit(50);
  });

  // Portal: Upload evidence
  fastify.post('/api/v1/portal/compliance/evidence/upload', {
    preHandler: [fastify.authenticate],
  }, async (request, reply) => {
    if (!(request as any).user?.cid) return { error: 'Not a portal user' };
    const customerId = (request as any).user.cid;
    const contactId = (request as any).user.sub;
    const { uploadFile, isR2Configured } = await import('../../services/r2-storage.js');
    const { randomUUID } = await import('crypto');

    const data = await request.file();
    if (!data) { reply.code(400); return { error: 'No file uploaded' }; }

    const buffer = await data.toBuffer();
    const fileName = data.filename;
    const mimeType = data.mimetype;
    const fileSize = buffer.length;
    const fields = data.fields as any;
    const title = fields?.title?.value || fileName;
    const controlStatusId = fields?.controlStatusId?.value || '';

    const evidenceId = randomUUID();
    const storageKey = `${request.tenantId}/customers/${customerId}/compliance/evidence/${evidenceId}/${fileName}`;

    if (await isR2Configured(fastify.db, request.tenantId)) {
      await uploadFile(fastify.db, request.tenantId, storageKey, buffer, mimeType);
    }

    const [evidence] = await fastify.db.insert(complianceEvidence).values({
      tenantId: request.tenantId, customerId, title,
      evidenceType: 'document', fileName, fileSize, mimeType, storageKey,
      collectedAt: new Date(), uploadedByContact: contactId,
    }).returning();

    if (controlStatusId) {
      await fastify.db.insert(complianceEvidenceControls).values({
        evidenceId: evidence.id, controlStatusId,
      }).onConflictDoNothing();
    }

    reply.code(201);
    return evidence;
  });

  // ── Missing DELETE endpoints ────────────────────────────────────

  fastify.delete('/api/v1/compliance/poam/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(compliancePoamItems)
      .where(and(eq(compliancePoamItems.id, id), eq(compliancePoamItems.tenantId, request.tenantId)));
    return { deleted: true };
  });

  fastify.delete('/api/v1/compliance/risks/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(complianceRiskItems)
      .where(and(eq(complianceRiskItems.id, id), eq(complianceRiskItems.tenantId, request.tenantId)));
    return { deleted: true };
  });

  fastify.delete('/api/v1/compliance/personnel/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(compliancePersonnelScreening)
      .where(and(eq(compliancePersonnelScreening.id, id), eq(compliancePersonnelScreening.tenantId, request.tenantId)));
    return { deleted: true };
  });

  fastify.delete('/api/v1/compliance/training/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(complianceTrainingRecords)
      .where(and(eq(complianceTrainingRecords.id, id), eq(complianceTrainingRecords.tenantId, request.tenantId)));
    return { deleted: true };
  });

  fastify.delete('/api/v1/compliance/incidents/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(complianceIncidents)
      .where(and(eq(complianceIncidents.id, id), eq(complianceIncidents.tenantId, request.tenantId)));
    return { deleted: true };
  });

  // ── Evidence CRUD ───────────────────────────────────────────────

  fastify.get('/api/v1/compliance/customers/:customerId/evidence', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { customerId } = request.params as { customerId: string };
    return fastify.db.select().from(complianceEvidence)
      .where(and(eq(complianceEvidence.tenantId, request.tenantId), eq(complianceEvidence.customerId, customerId)))
      .orderBy(desc(complianceEvidence.createdAt)).limit(100);
  });

  // Evidence: Create with metadata only (for links, attestations)
  fastify.post('/api/v1/compliance/customers/:customerId/evidence', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const body = request.body as any;
    const [evidence] = await fastify.db.insert(complianceEvidence).values({
      tenantId: request.tenantId,
      customerId,
      title: body.title,
      evidenceType: body.evidenceType || 'document',
      description: body.description,
      fileName: body.fileName,
      fileSize: body.fileSize,
      mimeType: body.mimeType,
      storageKey: body.storageKey,
      externalUrl: body.externalUrl,
      collectedAt: body.collectedAt ? new Date(body.collectedAt) : new Date(),
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      uploadedBy: request.user.sub,
      tags: body.tags,
    }).returning();

    // Auto-link to control if controlStatusId provided
    if (body.controlStatusId) {
      await fastify.db.insert(complianceEvidenceControls).values({
        evidenceId: evidence.id, controlStatusId: body.controlStatusId,
      }).onConflictDoNothing();
    }

    reply.code(201);
    return evidence;
  });

  // Evidence: File upload (multipart) with R2 storage
  fastify.post('/api/v1/compliance/customers/:customerId/evidence/upload', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const { uploadFile, isR2Configured } = await import('../../services/r2-storage.js');
    const { randomUUID } = await import('crypto');

    const data = await request.file();
    if (!data) { reply.code(400); return { error: 'No file uploaded' }; }

    const buffer = await data.toBuffer();
    const fileName = data.filename;
    const mimeType = data.mimetype;
    const fileSize = buffer.length;

    // Extract form fields
    const fields = data.fields as any;
    const title = fields?.title?.value || fileName;
    const evidenceType = fields?.evidenceType?.value || 'document';
    const description = fields?.description?.value || '';
    const controlStatusId = fields?.controlStatusId?.value || '';
    const expiresAt = fields?.expiresAt?.value || '';

    // Secure storage path: customers/{cust}/compliance/evidence/{uuid}/{filename}
    const evidenceId = randomUUID();
    const storageKey = `${request.tenantId}/customers/${customerId}/compliance/evidence/${evidenceId}/${fileName}`;

    // Upload to R2 if configured
    if (await isR2Configured(fastify.db, request.tenantId)) {
      await uploadFile(fastify.db, request.tenantId, storageKey, buffer, mimeType);
    }

    // Create evidence record
    const [evidence] = await fastify.db.insert(complianceEvidence).values({
      tenantId: request.tenantId,
      customerId,
      title,
      evidenceType,
      description,
      fileName,
      fileSize,
      mimeType,
      storageKey,
      collectedAt: new Date(),
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      uploadedBy: request.user.sub,
    }).returning();

    // Auto-link to control if provided
    if (controlStatusId) {
      await fastify.db.insert(complianceEvidenceControls).values({
        evidenceId: evidence.id, controlStatusId,
      }).onConflictDoNothing();
    }

    // Log the upload
    await fastify.db.insert(complianceActivityLog).values({
      tenantId: request.tenantId,
      customerId,
      entityType: 'evidence',
      entityId: evidence.id,
      action: 'created',
      actorType: 'user',
      actorId: request.user.sub,
      description: `Evidence uploaded: ${fileName} (${(fileSize / 1024).toFixed(0)} KB)`,
    });

    reply.code(201);
    return evidence;
  });

  // Evidence: Download (signed URL)
  fastify.get('/api/v1/compliance/evidence/:id/download', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [evidence] = await fastify.db.select().from(complianceEvidence)
      .where(and(eq(complianceEvidence.id, id), eq(complianceEvidence.tenantId, request.tenantId))).limit(1);
    if (!evidence) throw new NotFoundError('Evidence', id);
    if (!evidence.storageKey) return { error: 'No file stored for this evidence' };

    const { getFileUrl, isR2Configured } = await import('../../services/r2-storage.js');
    if (!await isR2Configured(fastify.db, request.tenantId)) return { error: 'Storage not configured' };

    const url = await getFileUrl(fastify.db, request.tenantId, evidence.storageKey, 300); // 5 min expiry
    return { url, fileName: evidence.fileName, mimeType: evidence.mimeType };
  });

  fastify.delete('/api/v1/compliance/evidence/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    // Delete evidence-control links first
    await fastify.db.delete(complianceEvidenceControls).where(eq(complianceEvidenceControls.evidenceId, id));
    await fastify.db.delete(complianceEvidence)
      .where(and(eq(complianceEvidence.id, id), eq(complianceEvidence.tenantId, request.tenantId)));
    return { deleted: true };
  });

  // Link evidence to control
  fastify.post('/api/v1/compliance/evidence/:id/link', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { controlStatusId: string; assessmentItemId?: string };
    await fastify.db.insert(complianceEvidenceControls).values({
      evidenceId: id,
      controlStatusId: body.controlStatusId,
      assessmentItemId: body.assessmentItemId || null,
    }).onConflictDoNothing();
    return { linked: true };
  });

  // ── Policies CRUD ───────────────────────────────────────────────

  fastify.get('/api/v1/compliance/policies', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(compliancePolicies.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(compliancePolicies.customerId, params.customerId));
    if (params.status) conditions.push(eq(compliancePolicies.status, params.status));
    return fastify.db.select().from(compliancePolicies)
      .where(and(...conditions)).orderBy(desc(compliancePolicies.updatedAt)).limit(100);
  });

  fastify.post('/api/v1/compliance/policies', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request, reply) => {
    const body = request.body as any;
    const [policy] = await fastify.db.insert(compliancePolicies).values({
      tenantId: request.tenantId,
      customerId: body.customerId || null,
      frameworkId: body.frameworkId || null,
      title: body.title,
      policyType: body.policyType || 'policy',
      content: body.content || '',
      status: 'draft',
      controlIds: body.controlIds,
      tags: body.tags,
    }).returning();
    reply.code(201);
    return policy;
  });

  fastify.patch('/api/v1/compliance/policies/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    // Get current for version tracking
    const [current] = await fastify.db.select().from(compliancePolicies)
      .where(and(eq(compliancePolicies.id, id), eq(compliancePolicies.tenantId, request.tenantId))).limit(1);
    if (!current) throw new NotFoundError('Policy', id);

    // Save version if content changed
    if (body.content !== undefined && body.content !== current.content) {
      await fastify.db.insert(compliancePolicyVersions).values({
        tenantId: request.tenantId,
        policyId: id,
        version: current.version ?? 1,
        content: current.content || '',
        changedBy: request.user.sub,
        changeNotes: body.changeNotes || null,
      });
      body.version = (current.version ?? 1) + 1;
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['title', 'policyType', 'content', 'version', 'status', 'effectiveDate', 'reviewDate', 'controlIds', 'tags', 'metadata']) {
      if (body[key] !== undefined) updates[key] = body[key];
    }
    if (body.status === 'approved') {
      updates.approvedBy = request.user.sub;
      updates.approvedAt = new Date();
    }

    const [updated] = await fastify.db.update(compliancePolicies).set(updates)
      .where(and(eq(compliancePolicies.id, id), eq(compliancePolicies.tenantId, request.tenantId))).returning();
    return updated;
  });

  fastify.delete('/api/v1/compliance/policies/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.update(compliancePolicies).set({ status: 'retired', updatedAt: new Date() })
      .where(and(eq(compliancePolicies.id, id), eq(compliancePolicies.tenantId, request.tenantId)));
    return { deleted: true };
  });

  fastify.get('/api/v1/compliance/policies/:id/versions', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return fastify.db.select().from(compliancePolicyVersions)
      .where(eq(compliancePolicyVersions.policyId, id))
      .orderBy(desc(compliancePolicyVersions.version));
  });
}
