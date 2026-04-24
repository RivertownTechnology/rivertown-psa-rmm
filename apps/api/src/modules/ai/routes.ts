import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs, serviceCatalogItems } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';

const VALID_CATEGORIES = ['license', 'security', 'backup', 'managed_service', 'support_hours', 'hardware', 'other'];
const VALID_ITEM_TYPES = ['recurring', 'per_device', 'per_user', 'block_time', 'one_time'];

async function executeActions(db: any, tenantId: string, response: string): Promise<{ response: string; actions: string[] }> {
  const actions: string[] = [];
  const actionRegex = /```action\s*\n?([\s\S]*?)```/g;
  let match;

  while ((match = actionRegex.exec(response)) !== null) {
    try {
      const action = JSON.parse(match[1].trim());

      if (action.action === 'create_product') {
        if (!action.name || !action.unitPriceCents) continue;
        const category = VALID_CATEGORIES.includes(action.category) ? action.category : 'other';
        const itemType = VALID_ITEM_TYPES.includes(action.itemType) ? action.itemType : 'recurring';

        const [product] = await db.insert(serviceCatalogItems).values({
          tenantId,
          name: action.name,
          description: action.description || null,
          proposalDescription: action.proposalDescription || null,
          sku: action.sku || null,
          vendor: action.vendor || null,
          category,
          itemType,
          defaultUnitCostCents: action.unitCostCents || 0,
          defaultUnitPriceCents: action.unitPriceCents,
          taxable: action.taxable !== false,
          isActive: true,
        }).returning();

        actions.push(`Created product: ${product.name} (SKU: ${product.sku || 'N/A'}) — $${(product.defaultUnitPriceCents / 100).toFixed(2)}/${itemType.replace('_', ' ')}`);
      }
    } catch { /* skip invalid JSON */ }
  }

  // Clean action blocks from the visible response
  const cleanResponse = response.replace(/```action\s*\n?[\s\S]*?```/g, '').trim();
  return { response: cleanResponse, actions };
}

export async function aiRoutes(fastify: FastifyInstance) {
  // Summarize a ticket
  fastify.post('/api/v1/ai/summarize-ticket', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { ticketId } = request.body as { ticketId: string };
    if (!ticketId || typeof ticketId !== 'string' || !/^[a-f0-9-]{36}$/i.test(ticketId)) {
      throw new Error('Invalid ticketId');
    }

    const { summarizeTicket } = await import('../../services/ai.js');
    const summary = await summarizeTicket(fastify.db, request.tenantId, ticketId);
    return { summary };
  });

  // Improve a reply draft
  fastify.post('/api/v1/ai/improve-reply', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { draftText, ticketSubject } = request.body as { draftText: string; ticketSubject: string };
    if (!draftText || typeof draftText !== 'string') throw new Error('draftText is required');
    if (draftText.length > 10000) throw new Error('draftText exceeds 10,000 characters');
    if (ticketSubject && ticketSubject.length > 500) throw new Error('ticketSubject exceeds 500 characters');

    const { improveReply } = await import('../../services/ai.js');
    const improvedText = await improveReply(fastify.db, request.tenantId, draftText, ticketSubject || '');
    return { improvedText };
  });

  // Chat with AI assistant
  fastify.post('/api/v1/ai/chat', {
    preHandler: [fastify.authenticate],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { messages, context } = request.body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      context?: string;
    };
    const { chat } = await import('../../services/ai.js');
    const rawResponse = await chat(fastify.db, request.tenantId, messages, context);
    const { response, actions } = await executeActions(fastify.db, request.tenantId, rawResponse);
    return { response, actions: actions.length > 0 ? actions : undefined };
  });

  // Get AI assistant config (name + status)
  fastify.get('/api/v1/ai/config', {
    preHandler: [fastify.authenticate],
  }, async (request) => {
    const [config] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ai')))
      .limit(1);
    if (!config?.isEnabled) return { enabled: false, name: 'Atlas' };
    const settings = (config.settings ?? {}) as Record<string, string>;
    return { enabled: true, name: settings.name || 'Atlas', provider: settings.provider || 'anthropic' };
  });
}
