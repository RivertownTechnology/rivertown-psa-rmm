import { FastifyInstance } from 'fastify';
import { eq, and, count, desc } from 'drizzle-orm';
import { contacts } from '@rivertown/db';
import { hash } from 'bcryptjs';
import { createContactSchema, updateContactSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';

export async function contactRoutes(fastify: FastifyInstance) {
  // List contacts (optionally filtered by customerId)
  fastify.get(
    '/api/v1/contacts',
    { preHandler: [fastify.authenticate, requirePermission('contacts:read')] },
    async (request) => {
      const query = paginationSchema.parse(request.query);
      const { customerId } = request.query as Record<string, string>;
      const { offset, limit } = paginationToOffset(query);

      const conditions = [eq(contacts.tenantId, request.tenantId)];
      if (customerId) conditions.push(eq(contacts.customerId, customerId));

      const where = and(...conditions);

      const [data, [{ total }]] = await Promise.all([
        fastify.db.select().from(contacts).where(where).limit(limit).offset(offset).orderBy(contacts.firstName),
        fastify.db.select({ total: count() }).from(contacts).where(where),
      ]);

      return paginate(data, total, query);
    },
  );

  // Get contact
  fastify.get(
    '/api/v1/contacts/:id',
    { preHandler: [fastify.authenticate, requirePermission('contacts:read')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const [contact] = await fastify.db.select().from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).limit(1);
      if (!contact) throw new NotFoundError('Contact', id);
      return contact;
    },
  );

  // Create contact
  fastify.post(
    '/api/v1/contacts',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request, reply) => {
      const body = createContactSchema.parse(request.body);
      const [contact] = await fastify.db.insert(contacts).values({
        tenantId: request.tenantId,
        customerId: body.customerId,
        firstName: body.firstName,
        lastName: body.lastName,
        email: body.email,
        phone: body.phone,
        jobTitle: body.jobTitle,
        isPrimary: body.isPrimary,
        portalEnabled: body.portalEnabled,
      }).returning();

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: 'contact.created', entityType: 'contact', entityId: contact.id, ipAddress: request.ip,
      });

      reply.code(201);
      return contact;
    },
  );

  // Update contact
  fastify.patch(
    '/api/v1/contacts/:id',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateContactSchema.parse(request.body);
      const [existing] = await fastify.db.select().from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Contact', id);

      const [updated] = await fastify.db.update(contacts)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).returning();
      return updated;
    },
  );

  // Delete contact
  fastify.delete(
    '/api/v1/contacts/:id',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [existing] = await fastify.db.select().from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Contact', id);

      await fastify.db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId)));
      reply.code(204).send();
    },
  );

  // Enable portal access for a contact
  fastify.post(
    '/api/v1/contacts/:id/portal-access',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const { enabled, password } = request.body as { enabled: boolean; password?: string };

      const [existing] = await fastify.db.select().from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Contact', id);

      const updateData: Record<string, unknown> = {
        portalEnabled: enabled,
        updatedAt: new Date(),
      };

      if (password) {
        updateData.portalPasswordHash = await hash(password, 12);
      }

      if (!enabled) {
        updateData.portalPasswordHash = null;
      }

      const [updated] = await fastify.db.update(contacts).set(updateData)
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).returning();

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: enabled ? 'contact.portal_enabled' : 'contact.portal_disabled',
        entityType: 'contact', entityId: id, ipAddress: request.ip,
      });

      return {
        id: updated.id,
        portalEnabled: updated.portalEnabled,
        hasPassword: !!updated.portalPasswordHash,
      };
    },
  );

  // Reset portal password for a contact
  fastify.post(
    '/api/v1/contacts/:id/portal-password',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const { password } = request.body as { password: string };

      if (!password || password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters');
      }

      const [existing] = await fastify.db.select().from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Contact', id);

      const passwordHash = await hash(password, 12);
      await fastify.db.update(contacts).set({ portalPasswordHash: passwordHash, updatedAt: new Date() })
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId)));

      return { success: true, message: 'Portal password updated' };
    },
  );
}
