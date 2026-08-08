import { FastifyInstance } from 'fastify';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { notifications, deviceTokens } from '@rivertown/db';

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

  // Register an iOS device token for push notifications (upsert by token)
  fastify.post('/api/v1/notifications/devices', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const body = request.body as {
      token?: string; platform?: string; bundleId?: string; environment?: string;
    };

    if (!body.token || !body.platform || !body.bundleId || !body.environment) {
      return reply.code(400).send({ error: 'token, platform, bundleId, and environment are required' });
    }
    if (body.environment !== 'sandbox' && body.environment !== 'production') {
      // A typo'd/mis-cased value here would silently route pushes to the wrong
      // APNs host, get BadDeviceToken back, and cause the worker to delete an
      // otherwise-valid token — so this is enforced strictly, not just trimmed.
      return reply.code(400).send({ error: 'environment must be "sandbox" or "production"' });
    }

    const now = new Date();
    await fastify.db.insert(deviceTokens)
      .values({
        tenantId: request.tenantId,
        userId: request.user.sub,
        token: body.token,
        platform: body.platform,
        bundleId: body.bundleId,
        environment: body.environment,
        lastSeenAt: now,
      })
      .onConflictDoUpdate({
        target: deviceTokens.token,
        set: {
          tenantId: request.tenantId,
          userId: request.user.sub,
          platform: body.platform,
          bundleId: body.bundleId,
          environment: body.environment,
          updatedAt: now,
          lastSeenAt: now,
        },
      });

    return reply.code(204).send();
  });

  // Remove a device token (e.g. on sign-out)
  fastify.delete('/api/v1/notifications/devices/:token', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { token } = request.params as { token: string };
    await fastify.db.delete(deviceTokens)
      .where(and(
        eq(deviceTokens.token, token),
        eq(deviceTokens.tenantId, request.tenantId),
        eq(deviceTokens.userId, request.user.sub),
      ));
    return reply.code(204).send();
  });
}
