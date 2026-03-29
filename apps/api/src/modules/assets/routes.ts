import { FastifyInstance } from 'fastify';
import { eq, and, ilike, or, count, desc } from 'drizzle-orm';
import { assets } from '@rivertown/db';
import { createAssetSchema, updateAssetSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';

export async function assetRoutes(fastify: FastifyInstance) {
  // List assets with rich filtering
  fastify.get(
    '/api/v1/assets',
    { preHandler: [fastify.authenticate, requirePermission('assets:read')] },
    async (request) => {
      const query = paginationSchema.parse(request.query);
      const params = request.query as Record<string, string>;
      const { offset, limit } = paginationToOffset(query);

      const conditions = [eq(assets.tenantId, request.tenantId)];
      if (params.customerId) conditions.push(eq(assets.customerId, params.customerId));
      if (params.siteId) conditions.push(eq(assets.siteId, params.siteId));
      if (params.assetType) conditions.push(eq(assets.assetType, params.assetType));
      if (params.status) conditions.push(eq(assets.status, params.status));
      if (params.search) {
        conditions.push(
          or(
            ilike(assets.name, `%${params.search}%`),
            ilike(assets.osName, `%${params.search}%`),
            ilike(assets.manufacturer, `%${params.search}%`),
            ilike(assets.model, `%${params.search}%`),
            ilike(assets.serialNumber, `%${params.search}%`),
            ilike(assets.ipAddress, `%${params.search}%`),
          )!,
        );
      }

      const where = and(...conditions);

      const [data, [{ total }]] = await Promise.all([
        fastify.db.select().from(assets).where(where).limit(limit).offset(offset).orderBy(desc(assets.lastSeenAt)),
        fastify.db.select({ total: count() }).from(assets).where(where),
      ]);
      return paginate(data, total, query);
    },
  );

  fastify.get(
    '/api/v1/assets/:id',
    { preHandler: [fastify.authenticate, requirePermission('assets:read')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const [asset] = await fastify.db.select().from(assets)
        .where(and(eq(assets.id, id), eq(assets.tenantId, request.tenantId))).limit(1);
      if (!asset) throw new NotFoundError('Asset', id);
      return asset;
    },
  );

  fastify.post(
    '/api/v1/assets',
    { preHandler: [fastify.authenticate, requirePermission('assets:write')] },
    async (request, reply) => {
      const body = createAssetSchema.parse(request.body);
      const [asset] = await fastify.db.insert(assets).values({
        tenantId: request.tenantId, customerId: body.customerId, siteId: body.siteId,
        contactId: body.contactId, assetType: body.assetType, name: body.name,
        serialNumber: body.serialNumber, manufacturer: body.manufacturer, model: body.model,
        osName: body.osName, osVersion: body.osVersion, notes: body.notes, status: body.status,
      }).returning();

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: 'asset.created', entityType: 'asset', entityId: asset.id, ipAddress: request.ip,
      });
      reply.code(201);
      return asset;
    },
  );

  fastify.patch(
    '/api/v1/assets/:id',
    { preHandler: [fastify.authenticate, requirePermission('assets:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateAssetSchema.parse(request.body);
      const [existing] = await fastify.db.select().from(assets)
        .where(and(eq(assets.id, id), eq(assets.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Asset', id);
      const [updated] = await fastify.db.update(assets).set({ ...body, updatedAt: new Date() })
        .where(and(eq(assets.id, id), eq(assets.tenantId, request.tenantId))).returning();
      return updated;
    },
  );
}
