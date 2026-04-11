import { FastifyInstance } from 'fastify';
import { requirePermission } from '../../auth/rbac.js';

export async function aiRoutes(fastify: FastifyInstance) {
  // Summarize a ticket
  fastify.post('/api/v1/ai/summarize-ticket', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')],
  }, async (request) => {
    const { ticketId } = request.body as { ticketId: string };
    if (!ticketId) throw new Error('ticketId is required');

    const { summarizeTicket } = await import('../../services/ai.js');
    const summary = await summarizeTicket(fastify.db, request.tenantId, ticketId);
    return { summary };
  });

  // Improve a reply draft
  fastify.post('/api/v1/ai/improve-reply', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')],
  }, async (request) => {
    const { draftText, ticketSubject } = request.body as { draftText: string; ticketSubject: string };
    if (!draftText) throw new Error('draftText is required');

    const { improveReply } = await import('../../services/ai.js');
    const improvedText = await improveReply(fastify.db, request.tenantId, draftText, ticketSubject || '');
    return { improvedText };
  });
}
