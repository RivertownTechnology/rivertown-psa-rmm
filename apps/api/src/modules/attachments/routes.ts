import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { attachments } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { uploadFile, getFileUrl, deleteFile, isR2Configured } from '../../services/r2-storage.js';
import { randomUUID } from 'crypto';

export async function attachmentRoutes(fastify: FastifyInstance) {
  // Upload attachment
  fastify.post('/api/v1/attachments', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const data = await request.file();
    if (!data) {
      reply.code(400);
      return { error: 'No file uploaded' };
    }

    const { entityType, entityId } = (request.query as { entityType?: string; entityId?: string });
    if (!entityType || !entityId) {
      reply.code(400);
      return { error: 'entityType and entityId query params are required' };
    }

    const buffer = await data.toBuffer();
    const fileName = data.filename;
    const mimeType = data.mimetype;
    const fileSize = buffer.length;
    const storageKey = `${request.tenantId}/${entityType}/${randomUUID()}-${fileName}`;

    if (await isR2Configured(fastify.db, request.tenantId)) {
      await uploadFile(fastify.db, request.tenantId, storageKey, buffer, mimeType);
    }

    const [attachment] = await fastify.db.insert(attachments).values({
      tenantId: request.tenantId,
      entityType,
      entityId,
      fileName,
      fileSize,
      mimeType,
      storageKey,
      uploadedBy: request.user.sub,
    }).returning();

    reply.code(201);
    return attachment;
  });

  // Download attachment (get signed URL)
  fastify.get('/api/v1/attachments/:id/download', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [attachment] = await fastify.db.select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, request.tenantId))).limit(1);

    if (!attachment) throw new NotFoundError('Attachment', id);

    if (!await isR2Configured(fastify.db, request.tenantId)) {
      reply.code(503);
      return { error: 'Storage not configured' };
    }

    const url = await getFileUrl(fastify.db, request.tenantId, attachment.storageKey);
    reply.redirect(url);
  });

  // List attachments for entity
  fastify.get('/api/v1/attachments', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const { entityType, entityId } = request.query as { entityType?: string; entityId?: string };
    if (!entityType || !entityId) return [];

    return fastify.db.select().from(attachments)
      .where(and(
        eq(attachments.tenantId, request.tenantId),
        eq(attachments.entityType, entityType),
        eq(attachments.entityId, entityId),
      ))
      .orderBy(attachments.createdAt);
  });

  // Delete attachment
  fastify.delete('/api/v1/attachments/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [attachment] = await fastify.db.select().from(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, request.tenantId))).limit(1);

    if (!attachment) throw new NotFoundError('Attachment', id);

    if (await isR2Configured(fastify.db, request.tenantId)) {
      await deleteFile(fastify.db, request.tenantId, attachment.storageKey);
    }

    await fastify.db.delete(attachments)
      .where(and(eq(attachments.id, id), eq(attachments.tenantId, request.tenantId)));

    reply.code(204).send();
  });
}
