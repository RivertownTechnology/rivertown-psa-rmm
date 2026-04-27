import { sanitizeBody } from '../../common/sanitize.js';
import { FastifyInstance } from 'fastify';
import { eq, and, count, desc } from 'drizzle-orm';
import { contacts } from '@rivertown/db';
import { hash } from 'bcryptjs';
import { randomBytes } from 'crypto';
import { createContactSchema, updateContactSchema, paginationSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';

function generatePassword(length = 20): string {
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$%&*';
  const bytes = randomBytes(length);
  return Array.from(bytes).map(b => charset[b % charset.length]).join('');
}

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
        .set({ ...sanitizeBody(body), updatedAt: new Date() })
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

  // Enable portal access for a contact — generates 20-char temp password, sends welcome email
  fastify.post(
    '/api/v1/contacts/:id/portal-access',
    { preHandler: [fastify.authenticate, requirePermission('customers:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const { enabled, portalRole, portalPermissions } = request.body as {
        enabled: boolean;
        portalRole?: 'admin' | 'user'; portalPermissions?: string[];
      };

      const [existing] = await fastify.db.select().from(contacts)
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Contact', id);

      const updateData: Record<string, unknown> = {
        portalEnabled: enabled,
        updatedAt: new Date(),
      };

      let tempPassword: string | null = null;

      if (enabled) {
        // Generate 20-char random password
        tempPassword = generatePassword(20);
        updateData.portalPasswordHash = await hash(tempPassword, 12);
        updateData.mustChangePassword = true;

        // Check if this is the first portal user for this company — auto-admin
        const [existingPortalUser] = await fastify.db.select({ id: contacts.id }).from(contacts)
          .where(and(
            eq(contacts.tenantId, request.tenantId),
            eq(contacts.customerId, existing.customerId),
            eq(contacts.portalEnabled, true),
          )).limit(1);

        if (!existingPortalUser) {
          updateData.portalRole = 'admin';
          updateData.portalPermissions = ['tickets', 'billing'];
        } else {
          updateData.portalRole = portalRole ?? 'user';
          updateData.portalPermissions = portalPermissions ?? ['tickets'];
        }
      }

      if (!enabled) {
        updateData.portalPasswordHash = null;
        updateData.portalRole = 'user';
        updateData.portalPermissions = ['tickets'];
        updateData.mustChangePassword = false;
      }

      const [updated] = await fastify.db.update(contacts).set(updateData)
        .where(and(eq(contacts.id, id), eq(contacts.tenantId, request.tenantId))).returning();

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: enabled ? 'contact.portal_enabled' : 'contact.portal_disabled',
        entityType: 'contact', entityId: id, ipAddress: request.ip,
      });

      // Send welcome email with temp password
      if (enabled && tempPassword) {
        const { sendEmail } = await import('../../services/email.js');
        const { renderTemplate, getDefaultTemplates } = await import('../../services/template-renderer.js');
        const { tenants } = await import('@rivertown/db');

        const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.tenantId)).limit(1);
        const settings = (tenant?.settings ?? {}) as Record<string, string>;
        const templates = getDefaultTemplates();
        const tpl = templates.find(t => t.templateType === 'portal_welcome');

        if (tpl) {
          const portalUrl = settings.portalUrl || process.env.PORTAL_URL || 'https://portal.rivertowntechnology.com';
          const vars: Record<string, string> = {
            businessName: settings.businessName || 'Rivertown Technology',
            businessLogo: settings.businessLogo || '',
            businessPhone: settings.businessPhone || '',
            businessEmail: settings.businessEmail || '',
            contactName: `${existing.firstName} ${existing.lastName}`,
            contactEmail: existing.email,
            portalUrl,
            tempPassword,
          };

          const subject = renderTemplate(tpl.subject, vars);
          const bodyHtml = renderTemplate(tpl.bodyHtml, vars);
          const bodyText = renderTemplate(tpl.bodyText, vars);

          sendEmail(fastify.db, request.tenantId, {
            to: existing.email,
            subject,
            html: bodyHtml,
            text: bodyText,
          }).catch(err => console.error('[PORTAL] Welcome email failed:', err));
        }
      }

      return {
        id: updated.id,
        portalEnabled: updated.portalEnabled,
        portalRole: updated.portalRole,
        portalPermissions: updated.portalPermissions,
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
