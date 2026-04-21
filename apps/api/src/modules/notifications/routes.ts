import { FastifyInstance } from 'fastify';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { notifications } from '@rivertown/db';

export async function notificationRoutes(fastify: FastifyInstance) {
  // List notifications for current user
  fastify.get('/api/v1/notifications', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const params = request.query as { unreadOnly?: string; limit?: string };
    const conditions: any[] = [
      eq(notifications.tenantId, request.tenantId),
      eq(notifications.userId, request.user.sub),
    ];
    if (params.unreadOnly === 'true') {
      conditions.push(eq(notifications.isRead, false));
    }

    const limit = Math.min(parseInt(params.limit || '50', 10), 100);

    return fastify.db.select().from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(limit);
  });

  // Unread count
  fastify.get('/api/v1/notifications/unread-count', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const [result] = await fastify.db.select({ count: count() }).from(notifications)
      .where(and(
        eq(notifications.tenantId, request.tenantId),
        eq(notifications.userId, request.user.sub),
        eq(notifications.isRead, false),
      ));
    return { count: result?.count ?? 0 };
  });

  // Mark single notification as read
  fastify.patch('/api/v1/notifications/:id/read', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [updated] = await fastify.db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.id, id),
        eq(notifications.tenantId, request.tenantId),
        eq(notifications.userId, request.user.sub),
      ))
      .returning();
    return updated ?? { success: true };
  });

  // Mark all as read
  fastify.post('/api/v1/notifications/mark-all-read', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    await fastify.db.update(notifications)
      .set({ isRead: true })
      .where(and(
        eq(notifications.tenantId, request.tenantId),
        eq(notifications.userId, request.user.sub),
        eq(notifications.isRead, false),
      ));
    return { success: true };
  });
}
