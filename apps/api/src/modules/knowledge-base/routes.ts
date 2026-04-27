import { sanitizeBody } from '../../common/sanitize.js';
import { FastifyInstance } from 'fastify';
import { eq, and, desc, sql } from 'drizzle-orm';
import { kbArticles, kbCategories } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';

export async function knowledgeBaseRoutes(fastify: FastifyInstance) {
  // ===== CATEGORIES =====

  // List categories
  fastify.get('/api/v1/kb/categories', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    return fastify.db.select().from(kbCategories)
      .where(eq(kbCategories.tenantId, request.tenantId))
      .orderBy(kbCategories.sortOrder);
  });

  // Create category
  fastify.post('/api/v1/kb/categories', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const body = request.body as { name: string; slug: string; sortOrder?: number };
    const [category] = await fastify.db.insert(kbCategories).values({
      tenantId: request.tenantId,
      name: body.name,
      slug: body.slug,
      sortOrder: body.sortOrder ?? 0,
    }).returning();
    reply.code(201);
    return category;
  });

  // Update category
  fastify.patch('/api/v1/kb/categories/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{ name: string; slug: string; sortOrder: number }>;
    const [updated] = await fastify.db.update(kbCategories)
      .set(body)
      .where(and(eq(kbCategories.id, id), eq(kbCategories.tenantId, request.tenantId)))
      .returning();
    if (!updated) throw new NotFoundError('KB Category', id);
    return updated;
  });

  // Delete category
  fastify.delete('/api/v1/kb/categories/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Unlink articles from this category first
    await fastify.db.update(kbArticles).set({ categoryId: null })
      .where(and(eq(kbArticles.categoryId, id), eq(kbArticles.tenantId, request.tenantId)));
    await fastify.db.delete(kbCategories)
      .where(and(eq(kbCategories.id, id), eq(kbCategories.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== ARTICLES =====

  // List articles (internal)
  fastify.get('/api/v1/kb/articles', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const params = request.query as { status?: string; visibility?: string; categoryId?: string };
    const conditions: any[] = [eq(kbArticles.tenantId, request.tenantId)];
    if (params.status) conditions.push(eq(kbArticles.status, params.status));
    if (params.visibility) conditions.push(eq(kbArticles.visibility, params.visibility));
    if (params.categoryId) conditions.push(eq(kbArticles.categoryId, params.categoryId));

    return fastify.db.select().from(kbArticles)
      .where(and(...conditions))
      .orderBy(desc(kbArticles.updatedAt));
  });

  // Get article by ID
  fastify.get('/api/v1/kb/articles/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [article] = await fastify.db.select().from(kbArticles)
      .where(and(eq(kbArticles.id, id), eq(kbArticles.tenantId, request.tenantId))).limit(1);
    if (!article) throw new NotFoundError('KB Article', id);

    // Increment view count
    await fastify.db.update(kbArticles)
      .set({ viewCount: sql`${kbArticles.viewCount} + 1` })
      .where(eq(kbArticles.id, id));

    return article;
  });

  // Create article
  fastify.post('/api/v1/kb/articles', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const body = request.body as {
      title: string; slug: string; body: string; categoryId?: string;
      visibility?: string; status?: string;
    };
    const [article] = await fastify.db.insert(kbArticles).values({
      tenantId: request.tenantId,
      title: body.title,
      slug: body.slug,
      body: body.body,
      categoryId: body.categoryId,
      visibility: body.visibility ?? 'internal',
      status: body.status ?? 'draft',
      authorId: request.user.sub,
    }).returning();
    reply.code(201);
    return article;
  });

  // Update article
  fastify.patch('/api/v1/kb/articles/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      title: string; slug: string; body: string; categoryId: string | null;
      visibility: string; status: string;
    }>;
    const [updated] = await fastify.db.update(kbArticles)
      .set({ ...sanitizeBody(body), updatedAt: new Date() })
      .where(and(eq(kbArticles.id, id), eq(kbArticles.tenantId, request.tenantId)))
      .returning();
    if (!updated) throw new NotFoundError('KB Article', id);
    return updated;
  });

  // Delete article
  fastify.delete('/api/v1/kb/articles/:id', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(kbArticles)
      .where(and(eq(kbArticles.id, id), eq(kbArticles.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== PORTAL ROUTES (public-facing, filtered) =====

  // List published portal articles
  fastify.get('/api/v1/portal/kb/articles', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const params = request.query as { categoryId?: string };
    const conditions: any[] = [
      eq(kbArticles.tenantId, request.tenantId),
      eq(kbArticles.status, 'published'),
      sql`${kbArticles.visibility} IN ('portal', 'public')`,
    ];
    if (params.categoryId) conditions.push(eq(kbArticles.categoryId, params.categoryId));

    return fastify.db.select({
      id: kbArticles.id,
      title: kbArticles.title,
      slug: kbArticles.slug,
      body: kbArticles.body,
      categoryId: kbArticles.categoryId,
      visibility: kbArticles.visibility,
      viewCount: kbArticles.viewCount,
      createdAt: kbArticles.createdAt,
      updatedAt: kbArticles.updatedAt,
    }).from(kbArticles)
      .where(and(...conditions))
      .orderBy(desc(kbArticles.updatedAt));
  });

  // Get single published portal article
  fastify.get('/api/v1/portal/kb/articles/:id', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [article] = await fastify.db.select().from(kbArticles)
      .where(and(
        eq(kbArticles.id, id),
        eq(kbArticles.tenantId, request.tenantId),
        eq(kbArticles.status, 'published'),
        sql`${kbArticles.visibility} IN ('portal', 'public')`,
      )).limit(1);
    if (!article) throw new NotFoundError('KB Article', id);

    // Increment view count
    await fastify.db.update(kbArticles)
      .set({ viewCount: sql`${kbArticles.viewCount} + 1` })
      .where(eq(kbArticles.id, id));

    return article;
  });

  // Portal categories
  fastify.get('/api/v1/portal/kb/categories', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    return fastify.db.select().from(kbCategories)
      .where(eq(kbCategories.tenantId, request.tenantId))
      .orderBy(kbCategories.sortOrder);
  });
}
