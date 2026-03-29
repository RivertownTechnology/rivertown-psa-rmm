import { FastifyInstance } from 'fastify';
import { eq, and, ilike, sql, count } from 'drizzle-orm';
import { customers } from '@rivertown/db';
import { createCustomerSchema, updateCustomerSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit, diffChanges } from '../../common/audit.js';

export async function customerRoutes(fastify: FastifyInstance) {
  // List customers
  fastify.get(
    '/api/v1/customers',
    { preHandler: [fastify.authenticate, requirePermission('customers:read')] },
    async (request) => {
      const query = paginationSchema.parse(request.query);
      const search = (request.query as Record<string, string>).search;
      const { offset, limit } = paginationToOffset(query);

      const conditions = [eq(customers.tenantId, request.tenantId)];
      if (search) {
        conditions.push(ilike(customers.name, `%${search}%`));
      }

      const where = and(...conditions);

      const [data, [{ total }]] = await Promise.all([
        fastify.db
          .select()
          .from(customers)
          .where(where)
          .limit(limit)
          .offset(offset)
          .orderBy(customers.name),
        fastify.db.select({ total: count() }).from(customers).where(where),
      ]);

      return paginate(data, total, query);
    },
  );

  // Get customer by ID
  fastify.get(
    '/api/v1/customers/:id',
    { preHandler: [fastify.authenticate, requirePermission('customers:read')] },
    async (request) => {
      const { id } = request.params as { id: string };

      const [customer] = await fastify.db
        .select()
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.tenantId)))
        .limit(1);

      if (!customer) throw new NotFoundError('Customer', id);
      return customer;
    },
  );

  // Create customer
  fastify.post(
    '/api/v1/customers',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request, reply) => {
      const body = createCustomerSchema.parse(request.body);

      const [customer] = await fastify.db
        .insert(customers)
        .values({
          tenantId: request.tenantId,
          name: body.name,
          status: body.status,
          billingEmail: body.billingEmail,
          ccBillingEmail: (body as any).ccBillingEmail,
          phone: body.phone,
          address: (body as any).address,
          city: (body as any).city,
          state: (body as any).state,
          zip: (body as any).zip,
          website: (body as any).website,
          notes: body.notes,
        })
        .returning();

      await logAudit(fastify.db, {
        tenantId: request.tenantId,
        actorType: 'user',
        actorId: request.user.sub,
        action: 'customer.created',
        entityType: 'customer',
        entityId: customer.id,
        ipAddress: request.ip,
      });

      reply.code(201);
      return customer;
    },
  );

  // Update customer
  fastify.patch(
    '/api/v1/customers/:id',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateCustomerSchema.parse(request.body);

      const [existing] = await fastify.db
        .select()
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.tenantId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Customer', id);

      const [updated] = await fastify.db
        .update(customers)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.tenantId)))
        .returning();

      const changes = diffChanges(existing as any, body as any);
      if (changes) {
        await logAudit(fastify.db, {
          tenantId: request.tenantId,
          actorType: 'user',
          actorId: request.user.sub,
          action: 'customer.updated',
          entityType: 'customer',
          entityId: id,
          changes,
          ipAddress: request.ip,
        });
      }

      return updated;
    },
  );

  // Delete customer
  fastify.delete(
    '/api/v1/customers/:id',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };

      const [existing] = await fastify.db
        .select()
        .from(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.tenantId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Customer', id);

      await fastify.db
        .delete(customers)
        .where(and(eq(customers.id, id), eq(customers.tenantId, request.tenantId)));

      await logAudit(fastify.db, {
        tenantId: request.tenantId,
        actorType: 'user',
        actorId: request.user.sub,
        action: 'customer.deleted',
        entityType: 'customer',
        entityId: id,
        ipAddress: request.ip,
      });

      reply.code(204).send();
    },
  );
}
