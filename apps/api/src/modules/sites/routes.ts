import { sanitizeBody } from '../../common/sanitize.js';
import { FastifyInstance } from 'fastify';
import { eq, and, count } from 'drizzle-orm';
import { sites } from '@rivertown/db';
import { createSiteSchema, updateSiteSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';

export async function siteRoutes(fastify: FastifyInstance) {
  fastify.get(
    '/api/v1/sites',
    { preHandler: [fastify.authenticate, requirePermission('sites:read')] },
    async (request) => {
      const query = paginationSchema.parse(request.query);
      const { customerId } = request.query as Record<string, string>;
      const { offset, limit } = paginationToOffset(query);

      const conditions = [eq(sites.tenantId, request.tenantId)];
      if (customerId) conditions.push(eq(sites.customerId, customerId));
      const where = and(...conditions);

      const [data, [{ total }]] = await Promise.all([
        fastify.db.select().from(sites).where(where).limit(limit).offset(offset).orderBy(sites.name),
        fastify.db.select({ total: count() }).from(sites).where(where),
      ]);
      return paginate(data, total, query);
    },
  );

  fastify.get(
    '/api/v1/sites/:id',
    { preHandler: [fastify.authenticate, requirePermission('sites:read')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const [site] = await fastify.db.select().from(sites)
        .where(and(eq(sites.id, id), eq(sites.tenantId, request.tenantId))).limit(1);
      if (!site) throw new NotFoundError('Site', id);
      return site;
    },
  );

  fastify.post(
    '/api/v1/sites',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request, reply) => {
      const body = createSiteSchema.parse(request.body);
      const [site] = await fastify.db.insert(sites).values({
        tenantId: request.tenantId, customerId: body.customerId, name: body.name,
        addressLine1: body.addressLine1, addressLine2: body.addressLine2,
        city: body.city, state: body.state, postalCode: body.postalCode,
        country: body.country, timezone: body.timezone,
      }).returning();

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: 'site.created', entityType: 'site', entityId: site.id, ipAddress: request.ip,
      });
      reply.code(201);
      return site;
    },
  );

  fastify.patch(
    '/api/v1/sites/:id',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateSiteSchema.parse(request.body);
      const [existing] = await fastify.db.select().from(sites)
        .where(and(eq(sites.id, id), eq(sites.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Site', id);
      const [updated] = await fastify.db.update(sites).set({ ...sanitizeBody(body), updatedAt: new Date() })
        .where(and(eq(sites.id, id), eq(sites.tenantId, request.tenantId))).returning();
      return updated;
    },
  );

  fastify.delete(
    '/api/v1/sites/:id',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [existing] = await fastify.db.select().from(sites)
        .where(and(eq(sites.id, id), eq(sites.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Site', id);
      await fastify.db.delete(sites).where(and(eq(sites.id, id), eq(sites.tenantId, request.tenantId)));
      reply.code(204).send();
    },
  );
}
