import { FastifyInstance } from 'fastify';
import { eq, and, ilike, sql, count, desc, asc, gte, lte, inArray } from 'drizzle-orm';
import {
  govOpportunities,
  govOpportunityActivities,
  govDocuments,
  govProposals,
  govComplianceItems,
  govDocumentLibrary,
  govSubmissions,
} from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { uploadFile, deleteFile, isR2Configured } from '../../services/r2-storage.js';
import { randomUUID } from 'crypto';
import {
  analyzeRFP,
  extractOpportunityFromRFP,
  calculateWinProbability,
  generateProposalDraft,
  improveProposalSection,
  analyzeLoss,
} from '../../services/gov-ai.js';

// ── Helper: log activity ────────────────────────────────────────────

async function logActivity(
  db: any,
  tenantId: string,
  opportunityId: string,
  userId: string,
  activityType: string,
  description: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(govOpportunityActivities).values({
    tenantId,
    opportunityId,
    userId,
    activityType,
    description,
    metadata: metadata ?? null,
  });
}

// ── Helper: parse pagination from query ─────────────────────────────

function parsePagination(query: Record<string, unknown>) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

function paginatedResponse<T>(data: T[], total: number, page: number, limit: number) {
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

// ════════════════════════════════════════════════════════════════════
// ── Routes ─────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════

export async function govContractRoutes(fastify: FastifyInstance) {

  // ── Opportunities: List ───────────────────────────────────────────

  fastify.get('/api/v1/gov/opportunities', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const query = request.query as Record<string, string>;
    const { page, limit, offset } = parsePagination(query);

    const conditions: ReturnType<typeof eq>[] = [eq(govOpportunities.tenantId, request.tenantId)];

    if (query.status) conditions.push(eq(govOpportunities.status, query.status));
    if (query.agencyType) conditions.push(eq(govOpportunities.agencyType, query.agencyType));
    if (query.assignedTo) conditions.push(eq(govOpportunities.assignedTo, query.assignedTo));
    if (query.search) conditions.push(ilike(govOpportunities.title, `%${query.search}%`));

    const where = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      fastify.db.select().from(govOpportunities)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(govOpportunities.updatedAt)),
      fastify.db.select({ total: count() }).from(govOpportunities).where(where),
    ]);

    return paginatedResponse(data, total, page, limit);
  });

  // ── Opportunities: Get by ID ──────────────────────────────────────

  fastify.get('/api/v1/gov/opportunities/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);
    return opp;
  });

  // ── Opportunities: Create ────────────────────────────────────────

  fastify.post('/api/v1/gov/opportunities', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const body = request.body as Record<string, any>;

    const [opp] = await fastify.db.insert(govOpportunities).values({
      tenantId: request.tenantId,
      title: body.title,
      agency: body.agency,
      agencyType: body.agencyType || 'federal',
      source: body.source || 'manual',
      samNumber: body.samNumber || null,
      naicsCodes: body.naicsCodes || null,
      setAsideType: body.setAsideType || 'none',
      estimatedValue: body.estimatedValue != null ? Number(body.estimatedValue) : null,
      contractType: body.contractType || null,
      submissionDeadline: body.submissionDeadline ? new Date(body.submissionDeadline) : null,
      questionDeadline: body.questionDeadline ? new Date(body.questionDeadline) : null,
      status: body.status || 'discovered',
      assignedTo: body.assignedTo || null,
      contactName: body.contactName || null,
      contactEmail: body.contactEmail || null,
      contactPhone: body.contactPhone || null,
      incumbentInfo: body.incumbentInfo || null,
      competitorNotes: body.competitorNotes || null,
      requiredCertifications: body.requiredCertifications || null,
      tags: body.tags || null,
      notes: body.notes || null,
    }).returning();

    await logActivity(fastify.db, request.tenantId, opp.id, request.user.sub, 'status_change', `Opportunity created with status: ${opp.status}`);

    reply.code(201);
    return opp;
  });

  // ── Opportunities: Create from RFP (AI auto-populate) ────────────

  fastify.post('/api/v1/gov/opportunities/from-rfp', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } } as any,
  }, async (request, reply) => {
    const { text } = request.body as { text: string };
    if (!text || text.length < 50) throw new NotFoundError('RFP text', 'too short — paste the full RFP content');
    if (text.length > 100000) throw new NotFoundError('RFP text', 'too long — maximum 100,000 characters');

    // Step 1: Extract opportunity metadata with AI
    const extracted = await extractOpportunityFromRFP(fastify.db, request.tenantId, text);

    // Step 2: Create the opportunity
    const [opp] = await fastify.db.insert(govOpportunities).values({
      tenantId: request.tenantId,
      title: extracted.title,
      agency: extracted.agency,
      agencyType: extracted.agencyType || 'federal',
      source: 'manual',
      naicsCodes: extracted.naicsCodes?.length ? extracted.naicsCodes : null,
      setAsideType: extracted.setAsideType || 'none',
      estimatedValue: extracted.estimatedValue,
      contractType: extracted.contractType,
      submissionDeadline: extracted.submissionDeadline ? new Date(extracted.submissionDeadline) : null,
      questionDeadline: extracted.questionDeadline ? new Date(extracted.questionDeadline) : null,
      contactName: extracted.contactName,
      contactEmail: extracted.contactEmail,
      contactPhone: extracted.contactPhone,
      requiredCertifications: extracted.requiredCertifications?.length ? extracted.requiredCertifications : null,
      status: 'discovered',
      notes: text.substring(0, 50000), // Save the full RFP text for future analysis
    }).returning();

    // Step 3: Analyze the RFP for detailed breakdown
    const analysis = await analyzeRFP(fastify.db, request.tenantId, text);

    // Step 4: Store analysis on opportunity
    await fastify.db.update(govOpportunities).set({
      aiAnalysis: analysis as any,
      notes: analysis.summary,
      updatedAt: new Date(),
    }).where(eq(govOpportunities.id, opp.id));

    // Step 5: Auto-generate compliance checklist
    if (analysis.complianceItems?.length) {
      await fastify.db.insert(govComplianceItems).values(
        analysis.complianceItems.map((item, i) => ({
          tenantId: request.tenantId,
          opportunityId: opp.id,
          requirement: item,
          category: 'content',
          status: 'pending',
          sortOrder: i,
        }))
      );
    }

    // Step 6: Calculate win probability
    const winResult = await calculateWinProbability(fastify.db, request.tenantId, {
      ...opp, aiAnalysis: analysis,
    });
    await fastify.db.update(govOpportunities).set({
      winProbability: winResult.score,
    }).where(eq(govOpportunities.id, opp.id));

    // Log activity
    await logActivity(fastify.db, request.tenantId, opp.id, request.user.sub, 'ai_analysis',
      `Opportunity auto-created from RFP. AI extracted: ${extracted.title} (${extracted.agency}). Win probability: ${winResult.score}%.`);

    reply.code(201);
    return {
      opportunity: { ...opp, aiAnalysis: analysis, winProbability: winResult.score },
      analysis,
      winProbability: winResult,
      complianceItems: analysis.complianceItems?.length ?? 0,
    };
  });

  // ── Opportunities: Update ────────────────────────────────────────

  fastify.patch('/api/v1/gov/opportunities/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const [existing] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Opportunity', id);

    const updates: Record<string, any> = { updatedAt: new Date() };
    const fields = [
      'title', 'agency', 'agencyType', 'source', 'samNumber', 'naicsCodes',
      'setAsideType', 'contractType', 'status', 'assignedTo',
      'contactName', 'contactEmail', 'contactPhone', 'incumbentInfo',
      'competitorNotes', 'requiredCertifications', 'tags', 'winProbability',
      'aiAnalysis', 'awardedDate', 'lostReason', 'debriefNotes', 'notes',
    ];
    for (const f of fields) {
      if (body[f] !== undefined) updates[f] = body[f];
    }
    if (body.estimatedValue !== undefined) updates.estimatedValue = body.estimatedValue != null ? Number(body.estimatedValue) : null;
    if (body.awardedValue !== undefined) updates.awardedValue = body.awardedValue != null ? Number(body.awardedValue) : null;
    if (body.submissionDeadline !== undefined) updates.submissionDeadline = body.submissionDeadline ? new Date(body.submissionDeadline) : null;
    if (body.questionDeadline !== undefined) updates.questionDeadline = body.questionDeadline ? new Date(body.questionDeadline) : null;

    const [updated] = await fastify.db.update(govOpportunities)
      .set(updates)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .returning();

    if (body.status && body.status !== existing.status) {
      await logActivity(fastify.db, request.tenantId, id, request.user.sub, 'status_change', `Status changed from ${existing.status} to ${body.status}`);
    }

    return updated;
  });

  // ── Opportunities: Delete ────────────────────────────────────────

  fastify.delete('/api/v1/gov/opportunities/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [existing] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Opportunity', id);

    // Cascade delete all related records
    await fastify.db.delete(govSubmissions)
      .where(and(eq(govSubmissions.opportunityId, id), eq(govSubmissions.tenantId, request.tenantId)));
    await fastify.db.delete(govComplianceItems)
      .where(and(eq(govComplianceItems.opportunityId, id), eq(govComplianceItems.tenantId, request.tenantId)));
    await fastify.db.delete(govProposals)
      .where(and(eq(govProposals.opportunityId, id), eq(govProposals.tenantId, request.tenantId)));

    // Delete document files from R2
    const docs = await fastify.db.select().from(govDocuments)
      .where(and(eq(govDocuments.opportunityId, id), eq(govDocuments.tenantId, request.tenantId)));
    if (docs.length > 0 && await isR2Configured(fastify.db, request.tenantId)) {
      for (const doc of docs) {
        try { await deleteFile(fastify.db, request.tenantId, doc.storageKey); } catch { /* best effort */ }
      }
    }
    await fastify.db.delete(govDocuments)
      .where(and(eq(govDocuments.opportunityId, id), eq(govDocuments.tenantId, request.tenantId)));

    await fastify.db.delete(govOpportunityActivities)
      .where(and(eq(govOpportunityActivities.opportunityId, id), eq(govOpportunityActivities.tenantId, request.tenantId)));
    await fastify.db.delete(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)));

    reply.code(204).send();
  });

  // ── Activities: List ─────────────────────────────────────────────

  fastify.get('/api/v1/gov/opportunities/:id/activities', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return fastify.db.select().from(govOpportunityActivities)
      .where(and(eq(govOpportunityActivities.opportunityId, id), eq(govOpportunityActivities.tenantId, request.tenantId)))
      .orderBy(desc(govOpportunityActivities.createdAt));
  });

  // ── Activities: Add Note ─────────────────────────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/activities', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { description } = request.body as { description: string };

    const [opp] = await fastify.db.select({ id: govOpportunities.id }).from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    const [activity] = await fastify.db.insert(govOpportunityActivities).values({
      tenantId: request.tenantId,
      opportunityId: id,
      userId: request.user.sub,
      activityType: 'note',
      description,
    }).returning();

    reply.code(201);
    return activity;
  });

  // ── Documents: Upload ────────────────────────────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/documents', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [opp] = await fastify.db.select({ id: govOpportunities.id }).from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { error: 'No file uploaded' };
    }

    const buffer = await data.toBuffer();
    const fileName = data.filename;
    const mimeType = data.mimetype;
    const fileSize = buffer.length;
    const storageKey = `${request.tenantId}/gov-docs/${id}/${randomUUID()}-${fileName}`;

    if (await isR2Configured(fastify.db, request.tenantId)) {
      await uploadFile(fastify.db, request.tenantId, storageKey, buffer, mimeType);
    }

    const documentType = (data.fields as any)?.documentType?.value || 'rfp';

    const [doc] = await fastify.db.insert(govDocuments).values({
      tenantId: request.tenantId,
      opportunityId: id,
      fileName,
      fileSize,
      mimeType,
      storageKey,
      documentType,
      uploadedBy: request.user.sub,
    }).returning();

    await logActivity(fastify.db, request.tenantId, id, request.user.sub, 'document_upload', `Uploaded document: ${fileName}`);

    reply.code(201);
    return doc;
  });

  // ── Documents: List ──────────────────────────────────────────────

  fastify.get('/api/v1/gov/opportunities/:id/documents', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return fastify.db.select().from(govDocuments)
      .where(and(eq(govDocuments.opportunityId, id), eq(govDocuments.tenantId, request.tenantId)))
      .orderBy(desc(govDocuments.createdAt));
  });

  // ── Documents: Delete ────────────────────────────────────────────

  fastify.delete('/api/v1/gov/documents/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [doc] = await fastify.db.select().from(govDocuments)
      .where(and(eq(govDocuments.id, id), eq(govDocuments.tenantId, request.tenantId)))
      .limit(1);
    if (!doc) throw new NotFoundError('Document', id);

    if (await isR2Configured(fastify.db, request.tenantId)) {
      try { await deleteFile(fastify.db, request.tenantId, doc.storageKey); } catch { /* best effort */ }
    }

    await fastify.db.delete(govDocuments)
      .where(and(eq(govDocuments.id, id), eq(govDocuments.tenantId, request.tenantId)));

    reply.code(204).send();
  });

  // ── AI Analysis: Analyze RFP ─────────────────────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/analyze', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { id } = request.params as { id: string };

    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    // Read all uploaded documents' text (for now, use filenames + any existing data)
    const docs = await fastify.db.select().from(govDocuments)
      .where(and(eq(govDocuments.opportunityId, id), eq(govDocuments.tenantId, request.tenantId)));

    // Build document text from opportunity data and document metadata
    const docText = [
      `Title: ${opp.title}`,
      `Agency: ${opp.agency}`,
      `Agency Type: ${opp.agencyType}`,
      opp.notes ? `Notes: ${opp.notes}` : '',
      opp.incumbentInfo ? `Incumbent Info: ${opp.incumbentInfo}` : '',
      opp.competitorNotes ? `Competitor Notes: ${opp.competitorNotes}` : '',
      docs.length > 0 ? `Uploaded Documents: ${docs.map(d => `${d.fileName} (${d.documentType})`).join(', ')}` : '',
      opp.contractType ? `Contract Type: ${opp.contractType}` : '',
      opp.setAsideType ? `Set-Aside: ${opp.setAsideType}` : '',
      opp.naicsCodes ? `NAICS Codes: ${JSON.stringify(opp.naicsCodes)}` : '',
      opp.requiredCertifications ? `Required Certifications: ${JSON.stringify(opp.requiredCertifications)}` : '',
    ].filter(Boolean).join('\n');

    const analysis = await analyzeRFP(fastify.db, request.tenantId, docText);

    // Store analysis on opportunity
    await fastify.db.update(govOpportunities)
      .set({ aiAnalysis: analysis, updatedAt: new Date() })
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)));

    // Auto-generate compliance items from analysis
    if (analysis.complianceItems && analysis.complianceItems.length > 0) {
      const existingCompliance = await fastify.db.select({ requirement: govComplianceItems.requirement })
        .from(govComplianceItems)
        .where(and(eq(govComplianceItems.opportunityId, id), eq(govComplianceItems.tenantId, request.tenantId)));
      const existingSet = new Set(existingCompliance.map(c => c.requirement.toLowerCase()));

      const newItems = analysis.complianceItems.filter(item => !existingSet.has(item.toLowerCase()));
      if (newItems.length > 0) {
        await fastify.db.insert(govComplianceItems).values(
          newItems.map((item, idx) => ({
            tenantId: request.tenantId,
            opportunityId: id,
            requirement: item,
            category: 'content' as const,
            status: 'pending' as const,
            sortOrder: existingCompliance.length + idx,
          }))
        );
      }
    }

    // Calculate win probability
    const winResult = await calculateWinProbability(fastify.db, request.tenantId, { ...opp, aiAnalysis: analysis });
    await fastify.db.update(govOpportunities)
      .set({ winProbability: winResult.score, updatedAt: new Date() })
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)));

    await logActivity(fastify.db, request.tenantId, id, request.user.sub, 'ai_analysis', 'AI analysis completed');

    return { analysis, winProbability: winResult };
  });

  // ── AI Analysis: Win Probability ─────────────────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/win-probability', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { id } = request.params as { id: string };

    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    const result = await calculateWinProbability(fastify.db, request.tenantId, opp as unknown as Record<string, unknown>);

    await fastify.db.update(govOpportunities)
      .set({ winProbability: result.score, updatedAt: new Date() })
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)));

    return result;
  });

  // ── Proposals: List ──────────────────────────────────────────────

  fastify.get('/api/v1/gov/opportunities/:id/proposals', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return fastify.db.select().from(govProposals)
      .where(and(eq(govProposals.opportunityId, id), eq(govProposals.tenantId, request.tenantId)))
      .orderBy(desc(govProposals.updatedAt))
      .limit(50);
  });

  // ── Proposals: Create ────────────────────────────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/proposals', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } } as any,
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    let sections = body.sections || null;

    // Optionally AI-generate the proposal
    if (body.aiGenerate) {
      const rfpAnalysis = opp.aiAnalysis as any || null;

      // Gather library content
      const libraryItems = await fastify.db.select().from(govDocumentLibrary)
        .where(eq(govDocumentLibrary.tenantId, request.tenantId))
        .limit(20);
      const libraryContent = libraryItems.map(item => `[${item.category}] ${item.title}:\n${item.content}`).join('\n\n---\n\n');

      const draft = await generateProposalDraft(
        fastify.db,
        request.tenantId,
        opp as unknown as Record<string, unknown>,
        rfpAnalysis,
        libraryContent,
      );
      sections = draft.sections.map(s => ({ ...s, isComplete: false }));
    }

    const [proposal] = await fastify.db.insert(govProposals).values({
      tenantId: request.tenantId,
      opportunityId: id,
      title: body.title || `Proposal for ${opp.title}`,
      status: 'draft',
      version: 1,
      templateType: body.templateType || 'federal',
      sections,
      createdBy: request.user.sub,
    }).returning();

    await logActivity(fastify.db, request.tenantId, id, request.user.sub, 'note', `Proposal created: ${proposal.title}`);

    reply.code(201);
    return proposal;
  });

  // ── Proposals: Get by ID ─────────────────────────────────────────

  fastify.get('/api/v1/gov/proposals/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [proposal] = await fastify.db.select().from(govProposals)
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)))
      .limit(1);
    if (!proposal) throw new NotFoundError('Proposal', id);
    return proposal;
  });

  // ── Proposals: Update ────────────────────────────────────────────

  fastify.patch('/api/v1/gov/proposals/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const [existing] = await fastify.db.select().from(govProposals)
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Proposal', id);

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.status !== undefined) updates.status = body.status;
    if (body.sections !== undefined) updates.sections = body.sections;
    if (body.templateType !== undefined) updates.templateType = body.templateType;
    if (body.reviewedBy !== undefined) updates.reviewedBy = body.reviewedBy;
    if (body.status === 'submitted') updates.submittedAt = new Date();

    const [updated] = await fastify.db.update(govProposals)
      .set(updates)
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)))
      .returning();

    return updated;
  });

  // ── Proposals: AI Improve Section ────────────────────────────────

  fastify.post('/api/v1/gov/proposals/:id/ai-improve', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { sectionIndex, rfpContext } = request.body as { sectionIndex: number; rfpContext?: string };

    const [proposal] = await fastify.db.select().from(govProposals)
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)))
      .limit(1);
    if (!proposal) throw new NotFoundError('Proposal', id);

    const sections = (proposal.sections || []) as Array<{ title: string; content: string; order: number; isComplete?: boolean }>;
    if (sectionIndex < 0 || sectionIndex >= sections.length) {
      throw new NotFoundError('Section');
    }

    const section = sections[sectionIndex];

    // Get RFP context from opportunity if not provided
    let context = rfpContext || '';
    if (!context) {
      const [opp] = await fastify.db.select().from(govOpportunities)
        .where(and(eq(govOpportunities.id, proposal.opportunityId), eq(govOpportunities.tenantId, request.tenantId)))
        .limit(1);
      if (opp?.aiAnalysis) {
        context = JSON.stringify(opp.aiAnalysis);
      }
    }

    const improvedContent = await improveProposalSection(
      fastify.db,
      request.tenantId,
      { title: section.title, content: section.content },
      context,
    );

    // Update the section in the proposal
    sections[sectionIndex] = { ...section, content: improvedContent };
    await fastify.db.update(govProposals)
      .set({ sections, updatedAt: new Date() })
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)));

    return { sectionIndex, improvedContent };
  });

  // ── Compliance: List ─────────────────────────────────────────────

  fastify.get('/api/v1/gov/opportunities/:id/compliance', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return fastify.db.select().from(govComplianceItems)
      .where(and(eq(govComplianceItems.opportunityId, id), eq(govComplianceItems.tenantId, request.tenantId)))
      .orderBy(asc(govComplianceItems.sortOrder));
  });

  // ── Compliance: Add Item ─────────────────────────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/compliance', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const [opp] = await fastify.db.select({ id: govOpportunities.id }).from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    const [item] = await fastify.db.insert(govComplianceItems).values({
      tenantId: request.tenantId,
      opportunityId: id,
      requirement: body.requirement,
      category: body.category || 'content',
      status: body.status || 'pending',
      notes: body.notes || null,
      dueDate: body.dueDate || null,
      assignedTo: body.assignedTo || null,
      sortOrder: body.sortOrder || 0,
    }).returning();

    await logActivity(fastify.db, request.tenantId, id, request.user.sub, 'compliance_update', `Compliance item added: ${body.requirement}`);

    reply.code(201);
    return item;
  });

  // ── Compliance: Update Status ────────────────────────────────────

  fastify.patch('/api/v1/gov/compliance/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const [existing] = await fastify.db.select().from(govComplianceItems)
      .where(and(eq(govComplianceItems.id, id), eq(govComplianceItems.tenantId, request.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Compliance item', id);

    const updates: Record<string, any> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.category !== undefined) updates.category = body.category;
    if (body.dueDate !== undefined) updates.dueDate = body.dueDate;
    if (body.assignedTo !== undefined) updates.assignedTo = body.assignedTo;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    if (body.status === 'complete') updates.completedAt = new Date();

    const [updated] = await fastify.db.update(govComplianceItems)
      .set(updates)
      .where(and(eq(govComplianceItems.id, id), eq(govComplianceItems.tenantId, request.tenantId)))
      .returning();

    return updated;
  });

  // ── Compliance: AI Generate from RFP Analysis ────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/compliance/generate', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { id } = request.params as { id: string };

    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    const analysis = opp.aiAnalysis as any;
    if (!analysis?.complianceItems?.length) {
      return { message: 'No AI analysis available. Run AI analysis first.', items: [] };
    }

    // Get existing compliance items to avoid duplicates
    const existing = await fastify.db.select({ requirement: govComplianceItems.requirement })
      .from(govComplianceItems)
      .where(and(eq(govComplianceItems.opportunityId, id), eq(govComplianceItems.tenantId, request.tenantId)));
    const existingSet = new Set(existing.map(c => c.requirement.toLowerCase()));

    const newItems = (analysis.complianceItems as string[]).filter(item => !existingSet.has(item.toLowerCase()));
    if (newItems.length === 0) {
      return { message: 'All compliance items already exist.', items: [] };
    }

    const inserted = await fastify.db.insert(govComplianceItems).values(
      newItems.map((item, idx) => ({
        tenantId: request.tenantId,
        opportunityId: id,
        requirement: item,
        category: 'content' as const,
        status: 'pending' as const,
        sortOrder: existing.length + idx,
      }))
    ).returning();

    await logActivity(fastify.db, request.tenantId, id, request.user.sub, 'compliance_update', `AI generated ${inserted.length} compliance items`);

    return { message: `Generated ${inserted.length} compliance items.`, items: inserted };
  });

  // ── Submissions: Submit ──────────────────────────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/submit', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const [opp] = await fastify.db.select({ id: govOpportunities.id }).from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    const [submission] = await fastify.db.insert(govSubmissions).values({
      tenantId: request.tenantId,
      opportunityId: id,
      proposalId: body.proposalId || null,
      submissionMethod: body.method || null,
      submissionDate: body.date ? new Date(body.date) : new Date(),
      confirmationNumber: body.confirmationNumber || null,
      notes: body.notes || null,
      submittedBy: request.user.sub,
    }).returning();

    // Update opportunity status to submitted
    await fastify.db.update(govOpportunities)
      .set({ status: 'submitted', updatedAt: new Date() })
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)));

    await logActivity(fastify.db, request.tenantId, id, request.user.sub, 'status_change', `Proposal submitted via ${body.method || 'unknown'}`);

    reply.code(201);
    return submission;
  });

  // ── Submissions: List ────────────────────────────────────────────

  fastify.get('/api/v1/gov/opportunities/:id/submissions', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return fastify.db.select().from(govSubmissions)
      .where(and(eq(govSubmissions.opportunityId, id), eq(govSubmissions.tenantId, request.tenantId)))
      .orderBy(desc(govSubmissions.createdAt));
  });

  // ── Document Library: List ───────────────────────────────────────

  fastify.get('/api/v1/gov/library', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const query = request.query as Record<string, string>;
    const { page, limit, offset } = parsePagination(query);

    const conditions: ReturnType<typeof eq>[] = [eq(govDocumentLibrary.tenantId, request.tenantId)];
    if (query.category) conditions.push(eq(govDocumentLibrary.category, query.category));
    if (query.search) conditions.push(ilike(govDocumentLibrary.title, `%${query.search}%`));

    const where = and(...conditions);

    const [data, [{ total }]] = await Promise.all([
      fastify.db.select().from(govDocumentLibrary)
        .where(where)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(govDocumentLibrary.updatedAt)),
      fastify.db.select({ total: count() }).from(govDocumentLibrary).where(where),
    ]);

    return paginatedResponse(data, total, page, limit);
  });

  // ── Document Library: Create ─────────────────────────────────────

  fastify.post('/api/v1/gov/library', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const body = request.body as Record<string, any>;

    const [item] = await fastify.db.insert(govDocumentLibrary).values({
      tenantId: request.tenantId,
      title: body.title,
      category: body.category,
      content: body.content || '',
      tags: body.tags || null,
      createdBy: request.user.sub,
    }).returning();

    reply.code(201);
    return item;
  });

  // ── Document Library: Update ─────────────────────────────────────

  fastify.patch('/api/v1/gov/library/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, any>;

    const [existing] = await fastify.db.select().from(govDocumentLibrary)
      .where(and(eq(govDocumentLibrary.id, id), eq(govDocumentLibrary.tenantId, request.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Library item', id);

    const updates: Record<string, any> = { updatedAt: new Date() };
    if (body.title !== undefined) updates.title = body.title;
    if (body.category !== undefined) updates.category = body.category;
    if (body.content !== undefined) updates.content = body.content;
    if (body.tags !== undefined) updates.tags = body.tags;

    const [updated] = await fastify.db.update(govDocumentLibrary)
      .set(updates)
      .where(and(eq(govDocumentLibrary.id, id), eq(govDocumentLibrary.tenantId, request.tenantId)))
      .returning();

    return updated;
  });

  // ── Document Library: Delete ─────────────────────────────────────

  fastify.delete('/api/v1/gov/library/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };

    const [existing] = await fastify.db.select().from(govDocumentLibrary)
      .where(and(eq(govDocumentLibrary.id, id), eq(govDocumentLibrary.tenantId, request.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Library item', id);

    await fastify.db.delete(govDocumentLibrary)
      .where(and(eq(govDocumentLibrary.id, id), eq(govDocumentLibrary.tenantId, request.tenantId)));

    reply.code(204).send();
  });

  // ── Dashboard ────────────────────────────────────────────────────

  fastify.get('/api/v1/gov/dashboard', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const tenantCondition = eq(govOpportunities.tenantId, request.tenantId);

    // Opportunities by status with values
    const statusCounts = await fastify.db
      .select({
        status: govOpportunities.status,
        count: count(),
        totalValue: sql<number>`coalesce(sum(${govOpportunities.estimatedValue}), 0)::int`,
      })
      .from(govOpportunities)
      .where(tenantCondition)
      .groupBy(govOpportunities.status);

    // Upcoming deadlines (next 30 days)
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const upcomingDeadlines = await fastify.db.select({
      id: govOpportunities.id,
      title: govOpportunities.title,
      agency: govOpportunities.agency,
      submissionDeadline: govOpportunities.submissionDeadline,
      status: govOpportunities.status,
      estimatedValue: govOpportunities.estimatedValue,
    })
      .from(govOpportunities)
      .where(and(
        tenantCondition,
        gte(govOpportunities.submissionDeadline, now),
        lte(govOpportunities.submissionDeadline, thirtyDaysOut),
        sql`${govOpportunities.status} NOT IN ('awarded', 'lost', 'no_bid')`,
      ))
      .orderBy(asc(govOpportunities.submissionDeadline))
      .limit(10);

    // Win rate
    const [awarded] = await fastify.db.select({ count: count() }).from(govOpportunities)
      .where(and(tenantCondition, eq(govOpportunities.status, 'awarded')));
    const [lost] = await fastify.db.select({ count: count() }).from(govOpportunities)
      .where(and(tenantCondition, eq(govOpportunities.status, 'lost')));
    const totalDecided = (awarded?.count || 0) + (lost?.count || 0);
    const winRate = totalDecided > 0 ? Math.round(((awarded?.count || 0) / totalDecided) * 100) : 0;

    // Pipeline value (active opportunities)
    const [pipeline] = await fastify.db
      .select({ total: sql<number>`coalesce(sum(${govOpportunities.estimatedValue}), 0)::int` })
      .from(govOpportunities)
      .where(and(tenantCondition, sql`${govOpportunities.status} NOT IN ('awarded', 'lost', 'no_bid')`));

    // Total awarded value
    const [awardedValue] = await fastify.db
      .select({ total: sql<number>`coalesce(sum(${govOpportunities.awardedValue}), 0)::int` })
      .from(govOpportunities)
      .where(and(tenantCondition, eq(govOpportunities.status, 'awarded')));

    // Recent activities
    const recentActivities = await fastify.db.select().from(govOpportunityActivities)
      .where(eq(govOpportunityActivities.tenantId, request.tenantId))
      .orderBy(desc(govOpportunityActivities.createdAt))
      .limit(15);

    return {
      statusCounts,
      upcomingDeadlines,
      winRate,
      pipelineValue: pipeline?.total || 0,
      awardedValue: awardedValue?.total || 0,
      recentActivities,
    };
  });

  // ── Analytics ────────────────────────────────────────────────────

  fastify.get('/api/v1/gov/analytics', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const tenantCondition = eq(govOpportunities.tenantId, request.tenantId);

    // Win/loss by agency type
    const byAgencyType = await fastify.db
      .select({
        agencyType: govOpportunities.agencyType,
        status: govOpportunities.status,
        count: count(),
        totalValue: sql<number>`coalesce(sum(${govOpportunities.estimatedValue}), 0)::int`,
      })
      .from(govOpportunities)
      .where(and(tenantCondition, sql`${govOpportunities.status} IN ('awarded', 'lost')`))
      .groupBy(govOpportunities.agencyType, govOpportunities.status);

    // Win/loss by set-aside type
    const bySetAside = await fastify.db
      .select({
        setAsideType: govOpportunities.setAsideType,
        status: govOpportunities.status,
        count: count(),
        totalValue: sql<number>`coalesce(sum(${govOpportunities.estimatedValue}), 0)::int`,
      })
      .from(govOpportunities)
      .where(and(tenantCondition, sql`${govOpportunities.status} IN ('awarded', 'lost')`))
      .groupBy(govOpportunities.setAsideType, govOpportunities.status);

    // Average bid value
    const [avgBid] = await fastify.db
      .select({ avg: sql<number>`coalesce(avg(${govOpportunities.estimatedValue}), 0)::int` })
      .from(govOpportunities)
      .where(and(tenantCondition, sql`${govOpportunities.estimatedValue} IS NOT NULL`));

    // Total awarded value
    const [totalAwarded] = await fastify.db
      .select({ total: sql<number>`coalesce(sum(${govOpportunities.awardedValue}), 0)::int` })
      .from(govOpportunities)
      .where(and(tenantCondition, eq(govOpportunities.status, 'awarded')));

    // Monthly trends (last 12 months)
    const trends = await fastify.db
      .select({
        month: sql<string>`to_char(${govOpportunities.createdAt}, 'YYYY-MM')`,
        count: count(),
        totalValue: sql<number>`coalesce(sum(${govOpportunities.estimatedValue}), 0)::int`,
      })
      .from(govOpportunities)
      .where(and(
        tenantCondition,
        gte(govOpportunities.createdAt, sql`now() - interval '12 months'`),
      ))
      .groupBy(sql`to_char(${govOpportunities.createdAt}, 'YYYY-MM')`)
      .orderBy(sql`to_char(${govOpportunities.createdAt}, 'YYYY-MM')`);

    return {
      byAgencyType,
      bySetAside,
      avgBidValue: avgBid?.avg || 0,
      totalAwardedValue: totalAwarded?.total || 0,
      trends,
    };
  });

  // ── Loss Analysis ────────────────────────────────────────────────

  fastify.post('/api/v1/gov/opportunities/:id/loss-analysis', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { id } = request.params as { id: string };

    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    const debriefNotes = opp.debriefNotes || (request.body as any)?.debriefNotes || '';
    const result = await analyzeLoss(
      fastify.db,
      request.tenantId,
      opp as unknown as Record<string, unknown>,
      debriefNotes,
    );

    return result;
  });
}
