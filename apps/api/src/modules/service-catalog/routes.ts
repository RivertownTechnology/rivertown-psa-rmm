import { FastifyInstance } from 'fastify';
import { eq, and, count, desc } from 'drizzle-orm';
import { serviceCatalogItems, serviceCatalogBundles, serviceCatalogBundleItems } from '@rivertown/db';
import { createCatalogItemSchema, updateCatalogItemSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';

export async function serviceCatalogRoutes(fastify: FastifyInstance) {
  // List catalog items
  fastify.get('/api/v1/service-catalog', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(serviceCatalogItems.tenantId, request.tenantId)];
    if (params.category) conditions.push(eq(serviceCatalogItems.category, params.category));
    if (params.isActive !== 'false') conditions.push(eq(serviceCatalogItems.isActive, true));
    const where = and(...conditions);
    const items = await fastify.db.select().from(serviceCatalogItems).where(where).orderBy(serviceCatalogItems.category, serviceCatalogItems.name);
    return items;
  });

  // Create catalog item
  fastify.post('/api/v1/service-catalog', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request, reply) => {
    const body = createCatalogItemSchema.parse(request.body);
    const [item] = await fastify.db.insert(serviceCatalogItems).values({
      tenantId: request.tenantId, ...body,
    }).returning();
    reply.code(201);
    return item;
  });

  // Update catalog item
  fastify.patch('/api/v1/service-catalog/:id', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const body = updateCatalogItemSchema.parse(request.body);
    const [existing] = await fastify.db.select().from(serviceCatalogItems)
      .where(and(eq(serviceCatalogItems.id, id), eq(serviceCatalogItems.tenantId, request.tenantId))).limit(1);
    if (!existing) throw new NotFoundError('Catalog item', id);
    const [updated] = await fastify.db.update(serviceCatalogItems).set({ ...body, updatedAt: new Date() })
      .where(and(eq(serviceCatalogItems.id, id), eq(serviceCatalogItems.tenantId, request.tenantId))).returning();
    return updated;
  });

  // Delete (soft)
  fastify.delete('/api/v1/service-catalog/:id', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    await fastify.db.update(serviceCatalogItems).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(serviceCatalogItems.id, id), eq(serviceCatalogItems.tenantId, request.tenantId)));
    return { deleted: true };
  });

  // List bundles
  fastify.get('/api/v1/service-catalog/bundles', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request) => {
    const bundles = await fastify.db.select().from(serviceCatalogBundles)
      .where(and(eq(serviceCatalogBundles.tenantId, request.tenantId), eq(serviceCatalogBundles.isActive, true)))
      .orderBy(serviceCatalogBundles.name);
    return bundles;
  });

  // Get bundle with items
  fastify.get('/api/v1/service-catalog/bundles/:id', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [bundle] = await fastify.db.select().from(serviceCatalogBundles)
      .where(and(eq(serviceCatalogBundles.id, id), eq(serviceCatalogBundles.tenantId, request.tenantId))).limit(1);
    if (!bundle) throw new NotFoundError('Bundle', id);

    const items = await fastify.db.select({
      id: serviceCatalogBundleItems.id,
      catalogItem: serviceCatalogItems,
      quantityMultiplier: serviceCatalogBundleItems.quantityMultiplier,
      sortOrder: serviceCatalogBundleItems.sortOrder,
    }).from(serviceCatalogBundleItems)
      .innerJoin(serviceCatalogItems, eq(serviceCatalogBundleItems.catalogItemId, serviceCatalogItems.id))
      .where(eq(serviceCatalogBundleItems.bundleId, id))
      .orderBy(serviceCatalogBundleItems.sortOrder);

    return { ...bundle, items };
  });

  // Create bundle
  fastify.post('/api/v1/service-catalog/bundles', { preHandler: [fastify.authenticate, requirePermission('contracts:read')] }, async (request, reply) => {
    const { name, description, items } = request.body as { name: string; description?: string; items: { catalogItemId: string; quantityMultiplier?: string; sortOrder?: number }[] };
    const [bundle] = await fastify.db.insert(serviceCatalogBundles).values({
      tenantId: request.tenantId, name, description,
    }).returning();

    for (const item of items ?? []) {
      await fastify.db.insert(serviceCatalogBundleItems).values({
        bundleId: bundle.id, catalogItemId: item.catalogItemId,
        quantityMultiplier: item.quantityMultiplier ?? '1', sortOrder: item.sortOrder ?? 0,
      });
    }
    reply.code(201);
    return bundle;
  });
}
