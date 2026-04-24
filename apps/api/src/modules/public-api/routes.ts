/**
 * Public API — API key authenticated endpoints for external integrations.
 * Used by the Harbor phone system (Jake, Nicole) to create/resolve tickets.
 *
 * Authentication: X-API-Key header (configured per tenant in settings)
 */

import { FastifyInstance } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { eq, and, sql, ilike } from 'drizzle-orm';
import { z } from 'zod';
import {
  tickets,
  ticketComments,
  ticketCategories,
  ticketSubcategories,
  tenantSequences,
  customers,
  contacts,
  integrationConfigs,
  apiKeys,
} from '@rivertown/db';
import { AppError, NotFoundError } from '../../common/errors.js';
import { logAudit } from '../../common/audit.js';

const createTicketApiSchema = z.object({
  callerName: z.string().min(1),
  callerCompany: z.string().optional(),
  callerPhone: z.string().optional(),
  callerEmail: z.string().email().optional(),
  subject: z.string().min(1).max(500),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  categorySlug: z.string().optional(),
  subcategorySlug: z.string().optional(),
  source: z.enum(['phone', 'api']).default('phone'),
});

const resolveTicketApiSchema = z.object({
  resolution: z.string().min(1),
});

const addCommentApiSchema = z.object({
  body: z.string().min(1),
  isInternal: z.boolean().default(true),
});

async function getNextTicketNumber(db: any, tenantId: string): Promise<number> {
  const [result] = await db
    .update(tenantSequences)
    .set({ currentValue: sql`(${tenantSequences.currentValue}::int + 1)::text` })
    .where(
      and(
        eq(tenantSequences.tenantId, tenantId),
        eq(tenantSequences.sequenceName, 'ticket'),
      ),
    )
    .returning({ value: tenantSequences.currentValue });

  return parseInt(result.value, 10);
}

export async function publicApiRoutes(fastify: FastifyInstance) {
  // API key auth hook for all /api/public/* routes
  fastify.addHook('onRequest', async (request) => {
    if (!request.url.startsWith('/api/public/')) return;

    const apiKey = request.headers['x-api-key'] as string;
    if (!apiKey) {
      throw new AppError(401, 'API key required', 'UNAUTHORIZED');
    }

    const expectedKey = process.env.PUBLIC_API_KEY;
    const tenantId = process.env.DEFAULT_TENANT_ID;

    // Try env var first
    if (expectedKey && tenantId) {
      const keyBuffer = Buffer.from(apiKey);
      const expectedBuffer = Buffer.from(expectedKey);
      if (keyBuffer.length === expectedBuffer.length && timingSafeEqual(keyBuffer, expectedBuffer)) {
        (request as any).tenantId = tenantId;
        return;
      }
    }

    // Check database API keys
    const { compare } = await import('bcryptjs');
    const allKeys = await fastify.db.select().from(apiKeys)
      .where(eq(apiKeys.isActive, true));

    for (const key of allKeys) {
      // Check expiration
      if (key.expiresAt && new Date(key.expiresAt) < new Date()) continue;

      const match = await compare(apiKey, key.keyHash);
      if (match) {
        (request as any).tenantId = key.tenantId;
        // Update last used
        fastify.db.update(apiKeys).set({ lastUsedAt: new Date() })
          .where(eq(apiKeys.id, key.id)).catch(() => {});
        return;
      }
    }

    throw new AppError(401, 'Invalid API key', 'UNAUTHORIZED');
  });

  // ----------------------------------------------------------------
  // Create ticket
  // ----------------------------------------------------------------
  fastify.post(
    '/api/public/tickets',
    { config: { public: true } as any },
    async (request, reply) => {
      const body = createTicketApiSchema.parse(request.body);
      const tenantId = (request as any).tenantId as string;

      // Try to match customer by company name
      let customerId: string | null = null;
      let contactId: string | null = null;

      if (body.callerCompany) {
        const [customer] = await fastify.db
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              ilike(customers.name, body.callerCompany),
            ),
          )
          .limit(1);

        if (customer) {
          customerId = customer.id;

          if (body.callerEmail) {
            const [contact] = await fastify.db
              .select()
              .from(contacts)
              .where(
                and(
                  eq(contacts.tenantId, tenantId),
                  eq(contacts.customerId, customer.id),
                  ilike(contacts.email, body.callerEmail),
                ),
              )
              .limit(1);
            if (contact) contactId = contact.id;
          }
        }
      }

      // Resolve category/subcategory by slug
      let categoryId: string | null = null;
      let subcategoryId: string | null = null;

      if (body.categorySlug) {
        const [cat] = await fastify.db
          .select()
          .from(ticketCategories)
          .where(
            and(
              eq(ticketCategories.tenantId, tenantId),
              eq(ticketCategories.slug, body.categorySlug),
            ),
          )
          .limit(1);
        if (cat) {
          categoryId = cat.id;
          if (body.subcategorySlug) {
            const [sub] = await fastify.db
              .select()
              .from(ticketSubcategories)
              .where(
                and(
                  eq(ticketSubcategories.tenantId, tenantId),
                  eq(ticketSubcategories.categoryId, cat.id),
                  eq(ticketSubcategories.slug, body.subcategorySlug),
                ),
              )
              .limit(1);
            if (sub) subcategoryId = sub.id;
          }
        }
      }

      // Fallback to "Unassigned" customer if no match
      if (!customerId) {
        const [defaultCustomer] = await fastify.db
          .select()
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              eq(customers.name, 'Unassigned'),
            ),
          )
          .limit(1);

        if (defaultCustomer) {
          customerId = defaultCustomer.id;
        } else {
          throw new AppError(
            422,
            `Could not match company "${body.callerCompany || 'unknown'}". Create the customer first or use an exact name.`,
            'CUSTOMER_NOT_FOUND',
          );
        }
      }

      const ticketNumber = await getNextTicketNumber(fastify.db, tenantId);

      const descParts: string[] = [];
      if (body.description) descParts.push(body.description);
      descParts.push('');
      descParts.push('--- Submitted via phone ---');
      descParts.push(`Caller: ${body.callerName}`);
      if (body.callerCompany) descParts.push(`Company: ${body.callerCompany}`);
      if (body.callerPhone) descParts.push(`Callback: ${body.callerPhone}`);
      if (body.callerEmail) descParts.push(`Email: ${body.callerEmail}`);

      const [ticket] = await fastify.db
        .insert(tickets)
        .values({
          tenantId,
          ticketNumber,
          customerId,
          contactId,
          categoryId,
          subcategoryId,
          subject: body.subject,
          description: descParts.join('\n'),
          priority: body.priority,
          ticketType: 'incident',
          source: body.source,
        })
        .returning();

      // Apply SLA
      const { calculateSla } = await import('../../services/sla-calculator.js');
      const sla = await calculateSla(fastify.db, tenantId, customerId, body.priority, new Date());
      if (sla.slaPolicyId) {
        await fastify.db
          .update(tickets)
          .set({
            slaDueAt: sla.slaDueAt,
            slaResponseDueAt: sla.slaResponseDueAt,
            slaResolutionDueAt: sla.slaResolutionDueAt,
            slaPolicyId: sla.slaPolicyId,
          })
          .where(eq(tickets.id, ticket.id));
      }

      await logAudit(fastify.db, {
        tenantId,
        actorType: 'system',
        actorId: '00000000-0000-0000-0000-000000000000',
        action: 'ticket.created.phone',
        entityType: 'ticket',
        entityId: ticket.id,
        ipAddress: request.ip,
      });

      reply.code(201);
      return {
        id: ticket.id,
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        status: ticket.status,
        priority: ticket.priority,
        customerId: ticket.customerId,
        customerMatched: !!body.callerCompany && customerId !== null,
      };
    },
  );

  // ----------------------------------------------------------------
  // Resolve ticket
  // ----------------------------------------------------------------
  fastify.post(
    '/api/public/tickets/:id/resolve',
    { config: { public: true } as any },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = resolveTicketApiSchema.parse(request.body);
      const tenantId = (request as any).tenantId as string;

      const [existing] = await fastify.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Ticket', id);

      await fastify.db.insert(ticketComments).values({
        tenantId,
        ticketId: id,
        authorType: 'system',
        authorId: '00000000-0000-0000-0000-000000000000',
        body: `Resolved via phone support: ${body.resolution}`,
        isInternal: true,
      });

      const [updated] = await fastify.db
        .update(tickets)
        .set({
          status: 'resolved',
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(tickets.id, id))
        .returning();

      await logAudit(fastify.db, {
        tenantId,
        actorType: 'system',
        actorId: '00000000-0000-0000-0000-000000000000',
        action: 'ticket.resolved.phone',
        entityType: 'ticket',
        entityId: id,
        ipAddress: request.ip,
      });

      return { id: updated.id, ticketNumber: updated.ticketNumber, status: updated.status };
    },
  );

  // ----------------------------------------------------------------
  // Add comment to ticket
  // ----------------------------------------------------------------
  fastify.post(
    '/api/public/tickets/:id/comments',
    { config: { public: true } as any },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = addCommentApiSchema.parse(request.body);
      const tenantId = (request as any).tenantId as string;

      const [comment] = await fastify.db
        .insert(ticketComments)
        .values({
          tenantId,
          ticketId: id,
          authorType: 'system',
          authorId: '00000000-0000-0000-0000-000000000000',
          body: body.body,
          isInternal: body.isInternal,
        })
        .returning();

      reply.code(201);
      return comment;
    },
  );

  // ----------------------------------------------------------------
  // Lookup client by phone number
  // ----------------------------------------------------------------
  fastify.get(
    '/api/public/lookup-by-phone',
    { config: { public: true } as any },
    async (request) => {
      const { phone } = request.query as { phone?: string };
      const tenantId = (request as any).tenantId as string;

      if (!phone || phone.length < 7) {
        return { found: false, message: 'Phone number too short' };
      }

      const digits = phone.replace(/\D/g, '');
      const last10 = digits.slice(-10);

      const allContacts = await fastify.db
        .select({
          contactId: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          customerId: contacts.customerId,
          customerName: customers.name,
        })
        .from(contacts)
        .innerJoin(customers, eq(contacts.customerId, customers.id))
        .where(eq(contacts.tenantId, tenantId));

      const match = allContacts.find((c) => {
        if (!c.phone) return false;
        const cDigits = c.phone.replace(/\D/g, '').slice(-10);
        return cDigits === last10;
      });

      if (match) {
        return {
          found: true,
          contact: {
            id: match.contactId,
            firstName: match.firstName,
            lastName: match.lastName,
            email: match.email,
            phone: match.phone,
          },
          customer: {
            id: match.customerId,
            name: match.customerName,
          },
        };
      }

      return { found: false, message: 'No contact found with that phone number' };
    },
  );

  // ----------------------------------------------------------------
  // Search contact by company + first name
  // ----------------------------------------------------------------
  fastify.get(
    '/api/public/contacts/search',
    { config: { public: true } as any },
    async (request) => {
      const { company, firstName } = request.query as { company?: string; firstName?: string };
      const tenantId = (request as any).tenantId as string;

      if (!company && !firstName) return [];

      let customerIds: string[] = [];
      if (company) {
        const matchedCustomers = await fastify.db
          .select({ id: customers.id })
          .from(customers)
          .where(
            and(
              eq(customers.tenantId, tenantId),
              ilike(customers.name, `%${company}%`),
            ),
          )
          .limit(10);
        customerIds = matchedCustomers.map((c) => c.id);
        if (customerIds.length === 0) return [];
      }

      const conditions: any[] = [eq(contacts.tenantId, tenantId)];
      if (customerIds.length > 0) {
        conditions.push(
          sql`${contacts.customerId} IN (${sql.join(customerIds.map((id) => sql`${id}::uuid`), sql`, `)})`,
        );
      }
      if (firstName) {
        conditions.push(ilike(contacts.firstName, `%${firstName}%`));
      }

      const results = await fastify.db
        .select({
          contactId: contacts.id,
          firstName: contacts.firstName,
          lastName: contacts.lastName,
          email: contacts.email,
          phone: contacts.phone,
          customerId: contacts.customerId,
          customerName: customers.name,
        })
        .from(contacts)
        .innerJoin(customers, eq(contacts.customerId, customers.id))
        .where(and(...conditions))
        .limit(5);

      return results.map((r) => ({
        contact: {
          id: r.contactId,
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email,
          phone: r.phone,
        },
        customer: {
          id: r.customerId,
          name: r.customerName,
        },
      }));
    },
  );

  // ----------------------------------------------------------------
  // Search customer by name
  // ----------------------------------------------------------------
  fastify.get(
    '/api/public/customers/search',
    { config: { public: true } as any },
    async (request) => {
      const { q } = request.query as { q?: string };
      const tenantId = (request as any).tenantId as string;

      if (!q || q.length < 2) return [];

      return fastify.db
        .select({ id: customers.id, name: customers.name, status: customers.status })
        .from(customers)
        .where(
          and(
            eq(customers.tenantId, tenantId),
            ilike(customers.name, `%${q}%`),
          ),
        )
        .limit(10);
    },
  );

  // ----------------------------------------------------------------
  // List categories
  // ----------------------------------------------------------------
  fastify.get(
    '/api/public/ticket-categories',
    { config: { public: true } as any },
    async (request) => {
      const tenantId = (request as any).tenantId as string;

      const categories = await fastify.db
        .select()
        .from(ticketCategories)
        .where(and(eq(ticketCategories.tenantId, tenantId), eq(ticketCategories.isActive, true)))
        .orderBy(ticketCategories.sortOrder);

      const subcats = await fastify.db
        .select()
        .from(ticketSubcategories)
        .where(and(eq(ticketSubcategories.tenantId, tenantId), eq(ticketSubcategories.isActive, true)))
        .orderBy(ticketSubcategories.sortOrder);

      return categories.map((cat) => ({
        id: cat.id,
        name: cat.name,
        slug: cat.slug,
        subcategories: subcats
          .filter((s) => s.categoryId === cat.id)
          .map((s) => ({ id: s.id, name: s.name, slug: s.slug })),
      }));
    },
  );

  // ----------------------------------------------------------------
  // N-central Custom PSA ticket endpoint
  // N-central sends tickets via POST with Basic Auth
  // Configure in N-central: Base URL = https://your-api/api/ncentral
  //                         Ticketing Endpoint = /ticketRequests
  // ----------------------------------------------------------------

  fastify.post(
    '/api/ncentral/ticketRequests',
    { config: { public: true } as any },
    async (request, reply) => {
      // Basic Auth
      const authHeader = request.headers.authorization;
      if (!authHeader?.startsWith('Basic ')) {
        reply.code(401);
        return { error: 'Basic authentication required' };
      }

      const decoded = Buffer.from(authHeader.slice(6), 'base64').toString();
      const [username, password] = decoded.split(':');

      // Check credentials against integration config
      const { readCredentials } = await import('../../common/credentials.js');
      const allConfigs = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.provider, 'ncentral'), eq(integrationConfigs.isEnabled, true)));

      let tenantId: string | null = null;
      for (const config of allConfigs) {
        const creds = readCredentials(config.credentials);
        // N-central provides the username/password configured in PSA settings
        // We match against stored ncentral config credentials
        const storedUser = (config.settings as any)?.psaUsername || 'ncentral';
        const storedPass = (creds as any).psaPassword || (creds as any).jwtToken || '';
        if (username === storedUser && password === storedPass) {
          tenantId = config.tenantId;
          break;
        }
      }

      if (!tenantId) {
        // Fallback to env vars
        const expectedKey = process.env.PUBLIC_API_KEY;
        const defaultTenant = process.env.DEFAULT_TENANT_ID;
        if (expectedKey && password === expectedKey && defaultTenant) {
          tenantId = defaultTenant;
        } else {
          reply.code(401);
          return { error: 'Invalid credentials' };
        }
      }

      // Parse N-central ticket format
      const body = request.body as Record<string, any>;

      // N-central sends: customerName, deviceName, description, priority, etc.
      const subject = body.subject || body.description?.substring(0, 100) || body.deviceName
        ? `[N-central] ${body.deviceName || 'Alert'}: ${(body.description || body.subject || 'N-central alert').substring(0, 80)}`
        : body.title || 'N-central Alert';

      const description = [
        body.description || '',
        body.deviceName ? `Device: ${body.deviceName}` : '',
        body.customerName ? `Customer: ${body.customerName}` : '',
        body.severity ? `Severity: ${body.severity}` : '',
        body.taskName ? `Task: ${body.taskName}` : '',
        body.serviceName ? `Service: ${body.serviceName}` : '',
      ].filter(Boolean).join('\n');

      // Map N-central severity to PSA priority
      const severityMap: Record<string, string> = {
        Critical: 'critical', Failed: 'critical',
        Warning: 'high',
        Normal: 'medium', Information: 'low',
      };
      const priority = severityMap[body.severity] || severityMap[body.priority] || 'medium';

      // Try to match customer
      let customerId: string | null = null;
      if (body.customerName) {
        const [customer] = await fastify.db.select().from(customers)
          .where(and(eq(customers.tenantId, tenantId), ilike(customers.name, body.customerName))).limit(1);
        if (customer) customerId = customer.id;
      }

      // If no customer match, use first customer or create a default
      if (!customerId) {
        const [first] = await fastify.db.select({ id: customers.id }).from(customers)
          .where(eq(customers.tenantId, tenantId)).limit(1);
        customerId = first?.id ?? null;
      }

      if (!customerId) {
        reply.code(400);
        return { error: 'No customers found in tenant' };
      }

      // Get next ticket number
      const [seq] = await fastify.db.select().from(tenantSequences)
        .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket'))).limit(1);
      const nextNum = parseInt(seq?.currentValue ?? '0', 10) + 1;
      await fastify.db.update(tenantSequences).set({ currentValue: String(nextNum) })
        .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket')));

      // Create ticket
      const [ticket] = await fastify.db.insert(tickets).values({
        tenantId,
        ticketNumber: nextNum,
        customerId,
        subject,
        description,
        priority,
        source: 'ncentral',
        status: 'new',
      }).returning();

      // Return N-central expected response
      reply.code(201);
      return {
        ticketId: ticket.id,
        ticketNumber: ticket.ticketNumber,
        status: 'created',
      };
    },
  );
}
