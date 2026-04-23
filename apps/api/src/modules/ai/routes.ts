import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';

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
    const response = await chat(fastify.db, request.tenantId, messages, context);
    return { response };
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
