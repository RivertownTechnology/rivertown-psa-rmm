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
  govPricingItems,
  serviceCatalogItems,
  integrationConfigs,
  slaPolicies,
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

// ── Helper: update opportunity estimated value from pricing items ───

async function updateOpportunityValue(db: any, tenantId: string, opportunityId: string) {
  const items = await db.select().from(govPricingItems)
    .where(and(eq(govPricingItems.opportunityId, opportunityId), eq(govPricingItems.tenantId, tenantId)));

  // Calculate total monthly value (exclude linked items — they're covered by their parent)
  let totalMonthlyCents = 0;
  for (const item of items) {
    if (item.linkedToId) continue; // Skip items linked to a parent (included in parent price)
    const qty = parseFloat(item.quantity ?? '1');
    const price = item.unitPriceCents ?? 0;
    if (item.frequency === 'annually') {
      totalMonthlyCents += Math.round((price * qty) / 12);
    } else if (item.frequency === 'one_time') {
      // Include one-time costs as-is for total estimate
      totalMonthlyCents += Math.round(price * qty);
    } else {
      totalMonthlyCents += Math.round(price * qty);
    }
  }

  // Annualize for estimated contract value
  const annualCents = totalMonthlyCents * 12;

  await db.update(govOpportunities).set({
    estimatedValue: annualCents,
    updatedAt: new Date(),
  }).where(eq(govOpportunities.id, opportunityId));
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
    await fastify.db.delete(govPricingItems)
      .where(and(eq(govPricingItems.opportunityId, id), eq(govPricingItems.tenantId, request.tenantId)));
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

  // ── Documents: Analyze a single document ─────────────────────────

  fastify.post('/api/v1/gov/documents/:id/analyze', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [doc] = await fastify.db.select().from(govDocuments)
      .where(and(eq(govDocuments.id, id), eq(govDocuments.tenantId, request.tenantId))).limit(1);
    if (!doc) throw new NotFoundError('Document', id);

    // Extract text from the document
    let docText = '';
    let extractError = '';
    if (!doc.storageKey) {
      extractError = 'No storage key — document was not uploaded to storage';
    } else if (!await isR2Configured(fastify.db, request.tenantId)) {
      extractError = 'Cloud storage (R2) is not configured';
    } else {
      try {
        const { getFileUrl } = await import('../../services/r2-storage.js');
        const url = await getFileUrl(fastify.db, request.tenantId, doc.storageKey);
        const res = await fetch(url);
        if (!res.ok) {
          extractError = `Failed to download file from storage (${res.status})`;
        } else {
          const buffer = Buffer.from(await res.arrayBuffer());

          if (doc.mimeType === 'application/pdf' || doc.fileName.endsWith('.pdf')) {
            try {
              const pdfParseModule = await import('pdf-parse');
              const pdfParse = (pdfParseModule as any).default || pdfParseModule;
              const pdfData = await pdfParse(buffer);
              docText = pdfData.text || '';
              if (!docText || docText.trim().length < 10) {
                extractError = 'PDF appears to be scanned/image-based with no extractable text. OCR is not currently supported.';
              }
            } catch (pdfErr) {
              console.error('[GOV-DOC] pdf-parse error:', pdfErr);
              extractError = `PDF parsing failed: ${pdfErr instanceof Error ? pdfErr.message : 'Unknown error'}`;
            }
          } else {
            docText = buffer.toString('utf-8');
          }
        }
      } catch (err) {
        console.error('[GOV-DOC] Failed to extract text:', err);
        extractError = `File retrieval failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
      }
    }

    if (!docText || docText.length < 10) {
      return { error: extractError || 'Could not extract text from this document' };
    }

    // Run AI analysis
    const analysis = await analyzeRFP(fastify.db, request.tenantId, docText);

    // Save analysis on the document
    await fastify.db.update(govDocuments).set({
      aiSummary: analysis.summary || analysis.scopeOfWork,
      aiExtractedData: analysis as any,
    }).where(eq(govDocuments.id, id));

    // Also update opportunity with this analysis and save RFP text to notes
    const [opp] = await fastify.db.select({ id: govOpportunities.id, notes: govOpportunities.notes })
      .from(govOpportunities).where(eq(govOpportunities.id, doc.opportunityId)).limit(1);
    if (opp) {
      await fastify.db.update(govOpportunities).set({
        aiAnalysis: analysis as any,
        notes: docText.substring(0, 50000),
        updatedAt: new Date(),
      }).where(eq(govOpportunities.id, doc.opportunityId));

      // Auto-generate compliance items
      if (analysis.complianceItems?.length) {
        // Clear existing auto-generated ones first
        for (const item of analysis.complianceItems) {
          const [existing] = await fastify.db.select({ id: govComplianceItems.id }).from(govComplianceItems)
            .where(and(eq(govComplianceItems.opportunityId, doc.opportunityId), eq(govComplianceItems.requirement, item))).limit(1);
          if (!existing) {
            await fastify.db.insert(govComplianceItems).values({
              tenantId: request.tenantId, opportunityId: doc.opportunityId,
              requirement: item, category: 'content', status: 'pending',
            });
          }
        }
      }

      // Calculate win probability
      const oppData = await fastify.db.select().from(govOpportunities).where(eq(govOpportunities.id, doc.opportunityId)).limit(1);
      if (oppData[0]) {
        const winResult = await calculateWinProbability(fastify.db, request.tenantId, oppData[0] as any);
        await fastify.db.update(govOpportunities).set({ winProbability: winResult.score })
          .where(eq(govOpportunities.id, doc.opportunityId));
      }
    }

    return analysis;
  });

  // ── AI Analysis: Analyze RFP (from opportunity notes) ───────────

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

    // Load default sections from template if available
    let defaultSections = [
      { title: 'Executive Summary', content: '', order: 1, isComplete: false },
      { title: 'Technical Approach', content: '', order: 2, isComplete: false },
      { title: 'Past Performance', content: '', order: 3, isComplete: false },
      { title: 'Staffing Plan', content: '', order: 4, isComplete: false },
      { title: 'SLA Matrix', content: '', order: 5, isComplete: false },
      { title: 'Pricing Narrative', content: '', order: 6, isComplete: false },
      { title: 'Compliance Matrix', content: '', order: 7, isComplete: false },
    ];

    const [templateConfig] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'gov_proposal_template')))
      .limit(1);
    if (templateConfig?.settings) {
      const tmpl = templateConfig.settings as any;
      if (tmpl.sections?.length) {
        defaultSections = tmpl.sections.map((s: any) => ({ title: s.title, content: '', order: s.order, isComplete: false }));
      }
    }

    let sections = body.sections || defaultSections;

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

  // ── Proposals: Generate/revoke share link ───────────────────────

  fastify.post('/api/v1/gov/proposals/:id/share', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { randomBytes } = await import('crypto');

    const [existing] = await fastify.db.select().from(govProposals)
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)))
      .limit(1);
    if (!existing) throw new NotFoundError('Proposal', id);

    const shareToken = randomBytes(24).toString('hex');
    await fastify.db.update(govProposals)
      .set({ shareToken, updatedAt: new Date() })
      .where(eq(govProposals.id, id));

    return { shareToken };
  });

  fastify.delete('/api/v1/gov/proposals/:id/share', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.update(govProposals)
      .set({ shareToken: null, updatedAt: new Date() })
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)));
    return { success: true };
  });

  // ── Public proposal view (no auth) ────────────────────────────

  fastify.get('/api/public/proposals/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!token || token.length < 10) return reply.code(404).send({ error: 'Not found' });

    const [proposal] = await fastify.db.select().from(govProposals)
      .where(eq(govProposals.shareToken, token))
      .limit(1);
    if (!proposal) return reply.code(404).send({ error: 'Not found' });

    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(eq(govOpportunities.id, proposal.opportunityId))
      .limit(1);

    const sections = ((proposal.sections || []) as Array<{ title: string; content: string; order: number }>)
      .sort((a, b) => a.order - b.order);

    return {
      title: proposal.title,
      status: proposal.status,
      agency: opp?.agency || '',
      opportunityTitle: opp?.title || '',
      samNumber: (opp as any)?.samNumber || '',
      submissionDeadline: opp?.submissionDeadline,
      sections,
    };
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

  // ── Proposals: Generate single section ────────────────────────────

  fastify.post('/api/v1/gov/proposals/:id/sections/:sectionIndex/generate', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { id, sectionIndex: sectionIndexStr } = request.params as { id: string; sectionIndex: string };
    const sectionIndex = parseInt(sectionIndexStr, 10);
    const body = (request.body || {}) as { instructions?: string; slaPolicyId?: string };

    const [proposal] = await fastify.db.select().from(govProposals)
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)))
      .limit(1);
    if (!proposal) throw new NotFoundError('Proposal', id);

    const sections = (proposal.sections || []) as Array<{ title: string; content: string; order: number; isComplete?: boolean }>;
    if (sectionIndex < 0 || sectionIndex >= sections.length) {
      throw new NotFoundError('Section');
    }

    const section = sections[sectionIndex];

    // Get opportunity context
    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, proposal.opportunityId), eq(govOpportunities.tenantId, request.tenantId)))
      .limit(1);

    const rfpContext = opp?.aiAnalysis ? JSON.stringify(opp.aiAnalysis) : '';

    // Gather library content
    const libraryItems = await fastify.db.select().from(govDocumentLibrary)
      .where(eq(govDocumentLibrary.tenantId, request.tenantId))
      .limit(20);
    const libraryContent = libraryItems.map(item => `[${item.category}] ${item.title}:\n${item.content}`).join('\n\n---\n\n');

    // Get pricing items for this opportunity (important for pricing sections)
    let pricingContext = '';
    if (opp) {
      const pricing = await fastify.db.select().from(govPricingItems)
        .where(eq(govPricingItems.opportunityId, opp.id))
        .orderBy(asc(govPricingItems.sortOrder));

      if (pricing.length > 0) {
        const pricingLines = pricing.map(p => {
          const price = ((p.unitPriceCents ?? 0) / 100).toFixed(2);
          const cost = ((p.unitCostCents ?? 0) / 100).toFixed(2);
          const margin = p.unitPriceCents && p.unitCostCents ? (((p.unitPriceCents - p.unitCostCents) / p.unitPriceCents) * 100).toFixed(0) : 'N/A';
          const linked = p.linkedToId ? ' (included in another item)' : '';
          return `- ${p.catalogItemName || p.need}: $${price}/${p.frequency} x${p.quantity} (cost: $${cost}, margin: ${margin}%)${linked}${p.notes ? ` — ${p.notes}` : ''}`;
        });
        pricingContext = `\nPricing items for this opportunity (${pricing.length}):\n${pricingLines.join('\n')}\n`;

        // Calculate totals
        const monthlyItems = pricing.filter(p => p.frequency === 'monthly' && !p.linkedToId);
        const monthlyTotal = monthlyItems.reduce((s, p) => s + (p.unitPriceCents ?? 0) * parseFloat(p.quantity ?? '1'), 0);
        const monthlyCost = monthlyItems.reduce((s, p) => s + (p.unitCostCents ?? 0) * parseFloat(p.quantity ?? '1'), 0);
        pricingContext += `Monthly recurring total: $${(monthlyTotal / 100).toFixed(2)} (cost: $${(monthlyCost / 100).toFixed(2)}, margin: ${monthlyTotal ? (((monthlyTotal - monthlyCost) / monthlyTotal) * 100).toFixed(0) : 'N/A'}%)\n`;
      }
    }

    // Get SLA policies for SLA sections
    let slaContext = '';
    if (section.title.toLowerCase().includes('sla')) {
      const slaList = await fastify.db.select().from(slaPolicies)
        .where(and(eq(slaPolicies.tenantId, request.tenantId), eq(slaPolicies.isActive, true)));

      // Use the SLA specified in body, or the default
      const selectedSla = body.slaPolicyId
        ? slaList.find(s => s.id === body.slaPolicyId)
        : slaList.find(s => s.isDefault) || slaList[0];

      if (selectedSla) {
        const fmtTime = (mins: number) => mins < 60 ? `${mins} minutes` : mins < 1440 ? `${Math.floor(mins/60)} hours` : `${Math.floor(mins/1440)} business days`;
        slaContext = `\nSLA Policy: "${selectedSla.name}"
| Priority | Response Time | Resolution Time |
|----------|--------------|-----------------|
| Critical | ${fmtTime(selectedSla.criticalResponseMinutes)} | ${fmtTime(selectedSla.criticalResolutionMinutes)} |
| High | ${fmtTime(selectedSla.highResponseMinutes)} | ${fmtTime(selectedSla.highResolutionMinutes)} |
| Medium | ${fmtTime(selectedSla.mediumResponseMinutes)} | ${fmtTime(selectedSla.mediumResolutionMinutes)} |
| Low | ${fmtTime(selectedSla.lowResponseMinutes)} | ${fmtTime(selectedSla.lowResolutionMinutes)} |

Business Hours: ${selectedSla.businessHoursEnabled ? `${selectedSla.businessHoursStart} - ${selectedSla.businessHoursEnd}` : '24/7'}
System Uptime Target: 99.9%\n`;
      }
    }

    // Get template instructions for this section
    let templateInstructions = '';
    const [tmplConfig] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'gov_proposal_template')))
      .limit(1);
    if (tmplConfig?.settings) {
      const tmpl = (tmplConfig.settings as any).sections as Array<{ title: string; instructions: string }> | undefined;
      const match = tmpl?.find(t => t.title.toLowerCase() === section.title.toLowerCase());
      if (match?.instructions) templateInstructions = match.instructions;
    }

    // Get company profile from template
    const companyProfile = tmplConfig?.settings ? ((tmplConfig.settings as any).companyProfile || '') : '';

    // Get other sections for context
    const otherSections = sections
      .filter((_, i) => i !== sectionIndex && _.content?.trim())
      .map(s => `## ${s.title}\n${s.content}`)
      .join('\n\n');

    const { callAI, getAIConfig } = await import('../../services/ai.js');
    const ai = await getAIConfig(fastify.db, request.tenantId);
    if (!ai) throw new Error('AI is not configured');

    const oppContext = opp ? `Title: ${opp.title}\nAgency: ${opp.agency} (${opp.agencyType})\nContract Type: ${opp.contractType || 'N/A'}\nSet-Aside: ${opp.setAsideType || 'none'}\nNotes: ${opp.notes || 'None'}` : '';

    const systemPrompt = `You are a government proposal writer for Rivertown Technology Group, an MSP. Generate the "${section.title}" section for a government IT services proposal.

${companyProfile ? `Company profile:\n${companyProfile}\n` : ''}
Opportunity details:
${oppContext}

${templateInstructions ? `Section guidelines: ${templateInstructions}\n` : ''}
${rfpContext ? `RFP Analysis:\n${rfpContext}\n` : ''}
${pricingContext}
${slaContext}
${libraryContent ? `Company library content:\n${libraryContent}\n` : ''}
${otherSections ? `Other proposal sections already written:\n${otherSections}\n` : ''}
${body.instructions ? `User instructions: ${body.instructions}\n` : ''}

Write a comprehensive, professional "${section.title}" section. Use markdown formatting. Be specific and detailed. Do not include other sections — only generate content for "${section.title}".
${section.title.toLowerCase().includes('pricing') ? '\nIMPORTANT: Include specific dollar amounts and service bundle pricing from the pricing items above. Create a clear pricing table or breakdown that the agency can evaluate.' : ''}
${section.title.toLowerCase().includes('sla') ? '\nIMPORTANT: Present the SLA data above in a professionally formatted markdown table. Include response times, resolution targets, escalation procedures, and uptime guarantees.' : ''}`;

    const content = await callAI(ai, systemPrompt, `Generate the "${section.title}" section for this government proposal.`, 3000);

    sections[sectionIndex] = { ...section, content };
    await fastify.db.update(govProposals)
      .set({ sections, updatedAt: new Date() })
      .where(and(eq(govProposals.id, id), eq(govProposals.tenantId, request.tenantId)));

    return { sectionIndex, content };
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

  // ── Compliance: Delete ───────────────────────────────────────────

  fastify.delete('/api/v1/gov/compliance/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(govComplianceItems)
      .where(and(eq(govComplianceItems.id, id), eq(govComplianceItems.tenantId, request.tenantId)));
    reply.code(204).send();
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

  // ── Pricing Items (Product Mapping) ──────────────────────────────

  // List pricing items for opportunity
  fastify.get('/api/v1/gov/opportunities/:id/pricing', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    return fastify.db.select().from(govPricingItems)
      .where(and(eq(govPricingItems.opportunityId, id), eq(govPricingItems.tenantId, request.tenantId)))
      .orderBy(govPricingItems.sortOrder);
  });

  // Add pricing item
  fastify.post('/api/v1/gov/opportunities/:id/pricing', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;

    // If catalogItemId provided, look up the catalog item for defaults
    let catalogItemName = body.catalogItemName || null;
    let unitPriceCents = body.unitPriceCents ?? 0;
    let unitCostCents = body.unitCostCents ?? 0;

    if (body.catalogItemId) {
      const [catItem] = await fastify.db.select().from(serviceCatalogItems)
        .where(and(eq(serviceCatalogItems.id, body.catalogItemId), eq(serviceCatalogItems.tenantId, request.tenantId))).limit(1);
      if (catItem) {
        catalogItemName = catItem.name;
        if (!body.unitPriceCents) unitPriceCents = catItem.defaultUnitPriceCents;
        if (!body.unitCostCents) unitCostCents = catItem.defaultUnitCostCents ?? 0;
      }
    }

    const [item] = await fastify.db.insert(govPricingItems).values({
      tenantId: request.tenantId,
      opportunityId: id,
      need: body.need,
      catalogItemId: body.catalogItemId || null,
      catalogItemName,
      quantity: body.quantity || '1',
      unitPriceCents,
      unitCostCents,
      frequency: body.frequency || 'monthly',
      notes: body.notes || null,
      sortOrder: body.sortOrder ?? 0,
    }).returning();

    // Update opportunity estimated value from total pricing
    await updateOpportunityValue(fastify.db, request.tenantId, id);

    reply.code(201);
    return item;
  });

  // Update pricing item
  fastify.patch('/api/v1/gov/pricing/:itemId', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { itemId } = request.params as { itemId: string };
    const body = request.body as any;

    // If changing catalog item, look up defaults
    if (body.catalogItemId) {
      const [catItem] = await fastify.db.select().from(serviceCatalogItems)
        .where(and(eq(serviceCatalogItems.id, body.catalogItemId), eq(serviceCatalogItems.tenantId, request.tenantId))).limit(1);
      if (catItem) {
        body.catalogItemName = catItem.name;
        if (body.unitPriceCents === undefined) body.unitPriceCents = catItem.defaultUnitPriceCents;
        if (body.unitCostCents === undefined) body.unitCostCents = catItem.defaultUnitCostCents ?? 0;
      }
    }

    const [updated] = await fastify.db.update(govPricingItems)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(govPricingItems.id, itemId), eq(govPricingItems.tenantId, request.tenantId)))
      .returning();

    if (updated) await updateOpportunityValue(fastify.db, request.tenantId, updated.opportunityId);

    return updated;
  });

  // Delete pricing item
  fastify.delete('/api/v1/gov/pricing/:itemId', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request, reply) => {
    const { itemId } = request.params as { itemId: string };
    const [item] = await fastify.db.select({ opportunityId: govPricingItems.opportunityId }).from(govPricingItems)
      .where(and(eq(govPricingItems.id, itemId), eq(govPricingItems.tenantId, request.tenantId))).limit(1);

    await fastify.db.delete(govPricingItems)
      .where(and(eq(govPricingItems.id, itemId), eq(govPricingItems.tenantId, request.tenantId)));

    if (item) await updateOpportunityValue(fastify.db, request.tenantId, item.opportunityId);

    reply.code(204).send();
  });

  // Auto-generate pricing items from AI analysis
  fastify.post('/api/v1/gov/opportunities/:id/pricing/generate', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [opp] = await fastify.db.select().from(govOpportunities)
      .where(and(eq(govOpportunities.id, id), eq(govOpportunities.tenantId, request.tenantId))).limit(1);
    if (!opp) throw new NotFoundError('Opportunity', id);

    const aiAnalysis = opp.aiAnalysis as any;
    const items = aiAnalysis?.itemsToPriceOut ?? aiAnalysis?.technicalRequirements ?? [];

    let created = 0;
    for (let i = 0; i < items.length; i++) {
      await fastify.db.insert(govPricingItems).values({
        tenantId: request.tenantId,
        opportunityId: id,
        need: items[i],
        sortOrder: i,
      });
      created++;
    }

    return { created };
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

  // ── Default Proposal Template ──────────────────────────────────

  fastify.get('/api/v1/gov/proposal-template', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const [config] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'gov_proposal_template')))
      .limit(1);

    const defaults = {
      sections: [
        { title: 'Executive Summary', instructions: 'Provide a high-level overview of our company, understanding of the client\'s needs, our approach, and why we are the best fit. Keep it concise — 1-2 pages.', order: 1 },
        { title: 'Technical Approach', instructions: 'Detail our service delivery framework, infrastructure management strategy, technology platform expertise, cybersecurity approach, and transition plan. Reference specific technologies and methodologies.', order: 2 },
        { title: 'Past Performance', instructions: 'Highlight relevant municipal and government IT experience, CJIS compliance work, similar-scope projects, and client satisfaction metrics. Include specific examples without naming clients unless authorized.', order: 3 },
        { title: 'Staffing Plan', instructions: 'Outline the team structure: account manager, technical lead, help desk, security specialist, network engineer. Include required certifications (CJIS, CompTIA, Microsoft, etc.) and response coverage model.', order: 4 },
        { title: 'SLA Matrix', instructions: 'Present our Service Level Agreement in a clear table format with response times, resolution targets, uptime guarantees, and escalation procedures by priority level. Pull from the selected SLA policy.', order: 5 },
        { title: 'Pricing Narrative', instructions: 'Explain our pricing philosophy, what is included in the fixed monthly fee, cost justification, and value proposition. Reference specific line items from the pricing tab. Include contract terms and renewal options.', order: 6 },
        { title: 'Compliance Matrix', instructions: 'Map our capabilities to every RFP requirement. Use a table with Requirement | Compliance Status | Evidence columns. Mark each as COMPLIANT with supporting detail.', order: 7 },
      ],
      companyProfile: '',
    };

    if (config?.settings) {
      const saved = config.settings as any;
      if (saved.sections) defaults.sections = saved.sections;
      if (saved.companyProfile) defaults.companyProfile = saved.companyProfile;
    }

    return defaults;
  });

  fastify.put('/api/v1/gov/proposal-template', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const body = request.body as { sections: Array<{ title: string; instructions: string; order: number }>; companyProfile?: string };

    const [existing] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'gov_proposal_template')))
      .limit(1);

    const settings = { sections: body.sections, companyProfile: body.companyProfile || '' };

    if (existing) {
      await fastify.db.update(integrationConfigs).set({ settings, updatedAt: new Date() })
        .where(eq(integrationConfigs.id, existing.id));
    } else {
      await fastify.db.insert(integrationConfigs).values({
        tenantId: request.tenantId, provider: 'gov_proposal_template',
        isEnabled: true, credentials: {}, settings,
      });
    }

    return { success: true };
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
