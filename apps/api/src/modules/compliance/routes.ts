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

// CJIS seed data inline for API-driven seeding
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
    if (!['cjis', 'hipaa', 'pci'].includes(type)) {
      return { error: 'Unknown framework type. Supported: cjis, hipaa, pci' };
    }

    // Check if already exists
    const shortNames: Record<string, string> = { cjis: 'CJIS', hipaa: 'HIPAA', pci: 'PCI-DSS' };
    const shortName = shortNames[type];
    const [existing] = await fastify.db.select({ id: complianceFrameworks.id })
      .from(complianceFrameworks)
      .where(and(eq(complianceFrameworks.tenantId, request.tenantId), eq(complianceFrameworks.shortName, shortName)))
      .limit(1);
    if (existing) return { message: `${shortName} framework already exists`, frameworkId: existing.id, controlCount: 0 };

    if (type === 'cjis') {
      return seedCJIS(fastify.db, request.tenantId);
    }
    // HIPAA and PCI coming soon
    return { message: `${shortName} framework template coming soon. Use custom framework for now.` };
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
    reply.code(201);
    return evidence;
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
