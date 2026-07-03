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
import { FRAMEWORKS } from './frameworks/index.js';
import { syncFramework } from './framework-sync.js';

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

  // ── Install / resync built-in framework ──────────────────────────

  fastify.post('/api/v1/compliance/frameworks/seed/:type', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { type } = request.params as { type: string };
    const data = FRAMEWORKS[type];
    if (!data) {
      return { error: `Unknown framework type. Supported: ${Object.keys(FRAMEWORKS).join(', ')}` };
    }
    const result = await syncFramework(fastify.db, request.tenantId, data, request.user?.sub);
    return {
      message: `${data.name} synced: ${result.inserted} added, ${result.updated} updated, ${result.deleted} removed, ${result.deprecated} deprecated`,
      ...result,
    };
  });

  // Resync every built-in framework already installed for this tenant
  fastify.post('/api/v1/compliance/frameworks/sync', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const installed = await fastify.db.select({ shortName: complianceFrameworks.shortName })
      .from(complianceFrameworks)
      .where(and(
        eq(complianceFrameworks.tenantId, request.tenantId),
        eq(complianceFrameworks.source, 'built_in'),
        eq(complianceFrameworks.isActive, true),
      ));
    const installedShortNames = new Set(installed.map((f: any) => f.shortName));
    const results = [];
    for (const data of Object.values(FRAMEWORKS)) {
      if (!installedShortNames.has(data.shortName)) continue;
      results.push(await syncFramework(fastify.db, request.tenantId, data, request.user?.sub));
    }
    return { synced: results.length, results };
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
