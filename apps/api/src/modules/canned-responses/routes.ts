import { FastifyInstance } from 'fastify';
import { eq, and, or, desc } from 'drizzle-orm';
import { cannedResponses } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';

export async function cannedResponseRoutes(fastify: FastifyInstance) {
  // List canned responses (shared + user's private)
  fastify.get('/api/v1/canned-responses', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    return fastify.db.select().from(cannedResponses)
      .where(and(
        eq(cannedResponses.tenantId, request.tenantId),
        or(
          eq(cannedResponses.isShared, true),
          eq(cannedResponses.createdBy, request.user.sub),
        ),
      ))
      .orderBy(cannedResponses.sortOrder, desc(cannedResponses.updatedAt))
      .limit(200);
  });

  // Get by ID
  fastify.get('/api/v1/canned-responses/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [response] = await fastify.db.select().from(cannedResponses)
      .where(and(eq(cannedResponses.id, id), eq(cannedResponses.tenantId, request.tenantId))).limit(1);
    if (!response) throw new NotFoundError('Canned Response', id);
    return response;
  });

  // Create
  fastify.post('/api/v1/canned-responses', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const body = request.body as {
      title: string; body: string; category?: string;
      shortcut?: string; isShared?: boolean; sortOrder?: number;
    };
    const [response] = await fastify.db.insert(cannedResponses).values({
      tenantId: request.tenantId,
      title: body.title,
      body: body.body,
      category: body.category,
      shortcut: body.shortcut,
      isShared: body.isShared ?? true,
      createdBy: request.user.sub,
      sortOrder: body.sortOrder ?? 0,
    }).returning();
    reply.code(201);
    return response;
  });

  // Update
  fastify.patch('/api/v1/canned-responses/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      title: string; body: string; category: string;
      shortcut: string; isShared: boolean; sortOrder: number;
    }>;
    const [updated] = await fastify.db.update(cannedResponses)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(cannedResponses.id, id), eq(cannedResponses.tenantId, request.tenantId)))
      .returning();
    if (!updated) throw new NotFoundError('Canned Response', id);
    return updated;
  });

  // Delete
  fastify.delete('/api/v1/canned-responses/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(cannedResponses)
      .where(and(eq(cannedResponses.id, id), eq(cannedResponses.tenantId, request.tenantId)));
    reply.code(204).send();
  });
}
