import { FastifyInstance } from 'fastify';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { compare, hash } from 'bcryptjs';
import { contacts, tickets, ticketComments, quotes, invoices, assets, tenantSequences } from '@rivertown/db';
import { ValidationError, NotFoundError } from '../../common/errors.js';

type PortalUser = { sub: string; tid: string; cid: string; role: string; portalRole: string; perms: string[] };

function getPortalUser(request: { user: unknown }): PortalUser {
  return request.user as PortalUser;
}

function requirePerm(user: PortalUser, perm: string) {
  if (user.portalRole === 'admin') return; // admins have all permissions
  const perms = user.perms ?? [];
  if (!perms.includes(perm)) {
    throw new ValidationError(`You don't have ${perm} access. Contact your portal administrator.`);
  }
}

export async function portalRoutes(fastify: FastifyInstance) {
  // ===== AUTH =====

  fastify.post('/api/v1/portal/auth/login', { config: { public: true, rateLimit: { max: 5, timeWindow: '5 minutes' } } as any }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [contact] = await fastify.db.select().from(contacts)
      .where(eq(contacts.email, email.toLowerCase())).limit(1);

    if (!contact || !contact.portalEnabled || !contact.portalPasswordHash) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    const valid = await compare(password, contact.portalPasswordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    const portalRole = (contact.portalRole as string) ?? 'user';
    const portalPerms = (contact.portalPermissions as string[]) ?? ['tickets'];

    const accessToken = fastify.jwt.sign(
      { sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', portalRole, perms: portalPerms, type: 'access' as const },
      { expiresIn: '4h' },
    );

    const refreshToken = fastify.jwt.sign(
      { sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', portalRole, perms: portalPerms, type: 'refresh' as const },
      { expiresIn: '7d' },
    );

    return {
      accessToken,
      refreshToken,
      user: { id: contact.id, name: `${contact.firstName} ${contact.lastName}`, email: contact.email },
      customerId: contact.customerId,
      portalRole,
      portalPermissions: portalPerms,
      mustChangePassword: contact.mustChangePassword,
    };
  });

  // ===== CHANGE PASSWORD =====

  fastify.post('/api/v1/portal/auth/change-password', async (request) => {
    const user = getPortalUser(request);
    const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };

    if (!newPassword || newPassword.length < 15) {
      throw new ValidationError('Password must be at least 15 characters');
    }

    const [contact] = await fastify.db.select().from(contacts)
      .where(eq(contacts.id, user.sub)).limit(1);
    if (!contact?.portalPasswordHash) throw new ValidationError('Account error');

    const valid = await compare(currentPassword, contact.portalPasswordHash);
    if (!valid) throw new ValidationError('Current password is incorrect');

    const newHash = await hash(newPassword, 12);
    await fastify.db.update(contacts).set({
      portalPasswordHash: newHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    }).where(eq(contacts.id, user.sub));

    return { success: true };
  });

  // ===== DASHBOARD STATS =====

  fastify.get('/api/v1/portal/stats', async (request) => {
    const user = getPortalUser(request);

    const [ticketStats] = await fastify.db.select({
      open: count(sql`CASE WHEN ${tickets.status} NOT IN ('resolved', 'closed') THEN 1 END`),
      total: count(),
    }).from(tickets)
      .where(and(eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)));

    const [invoiceStats] = await fastify.db.select({
      outstanding: count(sql`CASE WHEN ${invoices.status} IN ('sent', 'overdue') THEN 1 END`),
      outstandingCents: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} IN ('sent', 'overdue') THEN ${invoices.totalCents} - ${invoices.amountPaidCents} - ${invoices.creditsAppliedCents} ELSE 0 END), 0)`,
    }).from(invoices)
      .where(and(eq(invoices.tenantId, user.tid), eq(invoices.customerId, user.cid)));

    return {
      tickets: { open: Number(ticketStats?.open ?? 0), total: Number(ticketStats?.total ?? 0) },
      invoices: { outstanding: Number(invoiceStats?.outstanding ?? 0), outstandingCents: Number(invoiceStats?.outstandingCents ?? 0) },
    };
  });

  // ===== TICKETS =====

  fastify.get('/api/v1/portal/tickets', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    return fastify.db.select().from(tickets)
      .where(and(eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)))
      .orderBy(desc(tickets.createdAt)).limit(50);
  });

  fastify.post('/api/v1/portal/tickets', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    const { subject, description, categoryId, subcategoryId } = request.body as {
      subject: string; description?: string; categoryId?: string; subcategoryId?: string;
    };

    if (!subject?.trim()) throw new ValidationError('Subject is required');

    // Proper ticket numbering using tenant sequences
    const [seq] = await fastify.db.select().from(tenantSequences)
      .where(and(eq(tenantSequences.tenantId, user.tid), eq(tenantSequences.sequenceName, 'ticket')))
      .limit(1);
    const nextNum = parseInt(seq?.currentValue ?? '0', 10) + 1;
    await fastify.db.update(tenantSequences).set({ currentValue: String(nextNum) })
      .where(and(eq(tenantSequences.tenantId, user.tid), eq(tenantSequences.sequenceName, 'ticket')));

    const values: Record<string, unknown> = {
      tenantId: user.tid, ticketNumber: nextNum, customerId: user.cid,
      contactId: user.sub, subject: subject.trim(), description: description?.trim(),
      status: 'new', priority: 'medium', ticketType: 'service_request', source: 'portal',
    };
    if (categoryId) values.categoryId = categoryId;
    if (subcategoryId) values.subcategoryId = subcategoryId;

    const [ticket] = await fastify.db.insert(tickets).values(values as any).returning();

    // Apply SLA
    try {
      const { calculateSla } = await import('../../services/sla-calculator.js');
      const sla = await calculateSla(fastify.db, user.tid, user.cid, 'medium', new Date());
      if (sla.slaPolicyId) {
        await fastify.db.update(tickets).set({
          slaDueAt: sla.slaDueAt, slaResponseDueAt: sla.slaResponseDueAt,
          slaResolutionDueAt: sla.slaResolutionDueAt, slaPolicyId: sla.slaPolicyId,
        }).where(eq(tickets.id, ticket.id));
      }
    } catch { /* SLA is best-effort */ }

    return ticket;
  });

  fastify.get('/api/v1/portal/tickets/:id', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    const [ticket] = await fastify.db.select().from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)))
      .limit(1);
    if (!ticket) throw new NotFoundError('Ticket', id);
    return ticket;
  });

  fastify.get('/api/v1/portal/tickets/:id/comments', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    return fastify.db.select().from(ticketComments)
      .where(and(eq(ticketComments.ticketId, id), eq(ticketComments.tenantId, user.tid), eq(ticketComments.isInternal, false)))
      .orderBy(ticketComments.createdAt);
  });

  fastify.post('/api/v1/portal/tickets/:id/comments', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    const { body } = request.body as { body: string };
    if (!body?.trim()) throw new ValidationError('Comment body is required');

    // Verify ticket belongs to this customer
    const [ticket] = await fastify.db.select({ id: tickets.id }).from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)))
      .limit(1);
    if (!ticket) throw new NotFoundError('Ticket', id);

    const [comment] = await fastify.db.insert(ticketComments).values({
      tenantId: user.tid, ticketId: id, authorType: 'contact', authorId: user.sub,
      body: body.trim(), isInternal: false,
    }).returning();
    return comment;
  });

  // ===== INVOICES =====

  fastify.get('/api/v1/portal/invoices', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    return fastify.db.select().from(invoices)
      .where(and(eq(invoices.tenantId, user.tid), eq(invoices.customerId, user.cid)))
      .orderBy(desc(invoices.createdAt)).limit(50);
  });

  fastify.get('/api/v1/portal/invoices/:id', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [invoice] = await fastify.db.select().from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, user.tid), eq(invoices.customerId, user.cid)))
      .limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);
    return invoice;
  });

  // ===== QUOTES =====

  fastify.get('/api/v1/portal/quotes', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    return fastify.db.select().from(quotes)
      .where(and(eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid)))
      .orderBy(desc(quotes.createdAt)).limit(50);
  });

  fastify.post('/api/v1/portal/quotes/:id/approve', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [updated] = await fastify.db.update(quotes).set({ status: 'approved', approvedAt: new Date(), approvedBy: user.sub, updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid))).returning();
    if (!updated) throw new NotFoundError('Quote', id);
    return updated;
  });

  fastify.post('/api/v1/portal/quotes/:id/reject', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [updated] = await fastify.db.update(quotes).set({ status: 'rejected', updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid))).returning();
    if (!updated) throw new NotFoundError('Quote', id);
    return updated;
  });

  // ===== ASSETS =====

  fastify.get('/api/v1/portal/assets', async (request) => {
    const user = getPortalUser(request);
    return fastify.db.select().from(assets)
      .where(and(eq(assets.tenantId, user.tid), eq(assets.customerId, user.cid)))
      .orderBy(assets.name).limit(100);
  });

  // ===== CATEGORIES (for ticket submission) =====

  fastify.get('/api/v1/portal/ticket-categories', async (request) => {
    const user = getPortalUser(request);
    const { ticketCategories, ticketSubcategories } = await import('@rivertown/db');
    const categories = await fastify.db.select().from(ticketCategories)
      .where(and(eq(ticketCategories.tenantId, user.tid), eq(ticketCategories.isActive, true)))
      .orderBy(ticketCategories.sortOrder);
    const subcategories = await fastify.db.select().from(ticketSubcategories)
      .where(and(eq(ticketSubcategories.tenantId, user.tid), eq(ticketSubcategories.isActive, true)))
      .orderBy(ticketSubcategories.sortOrder);
    return categories.map(cat => ({
      ...cat,
      subcategories: subcategories.filter(sub => sub.categoryId === cat.id),
    }));
  });

  // ===== USER MANAGEMENT (portal admin only) =====

  // List portal users for this company
  fastify.get('/api/v1/portal/users', async (request) => {
    const user = getPortalUser(request);
    if (user.portalRole !== 'admin') throw new ValidationError('Only portal admins can manage users');

    const portalUsers = await fastify.db.select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      portalEnabled: contacts.portalEnabled,
      portalRole: contacts.portalRole,
      portalPermissions: contacts.portalPermissions,
    }).from(contacts)
      .where(and(eq(contacts.tenantId, user.tid), eq(contacts.customerId, user.cid)))
      .orderBy(contacts.firstName);

    return portalUsers;
  });

  // Invite / enable portal access for another contact (portal admin)
  fastify.post('/api/v1/portal/users/:contactId/enable', async (request) => {
    const user = getPortalUser(request);
    if (user.portalRole !== 'admin') throw new ValidationError('Only portal admins can manage users');

    const { contactId } = request.params as { contactId: string };
    const { password, permissions } = request.body as { password: string; permissions?: string[] };

    if (!password || password.length < 8) throw new ValidationError('Password must be at least 8 characters');

    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, user.tid), eq(contacts.customerId, user.cid)))
      .limit(1);
    if (!contact) throw new NotFoundError('Contact', contactId);

    const passwordHash = await hash(password, 12);
    const [updated] = await fastify.db.update(contacts).set({
      portalEnabled: true,
      portalPasswordHash: passwordHash,
      portalRole: 'user',
      portalPermissions: permissions ?? ['tickets'],
      updatedAt: new Date(),
    }).where(eq(contacts.id, contactId)).returning();

    return {
      id: updated.id, firstName: updated.firstName, lastName: updated.lastName,
      email: updated.email, portalRole: updated.portalRole, portalPermissions: updated.portalPermissions,
    };
  });

  // Update permissions for a portal user (portal admin)
  fastify.patch('/api/v1/portal/users/:contactId', async (request) => {
    const user = getPortalUser(request);
    if (user.portalRole !== 'admin') throw new ValidationError('Only portal admins can manage users');

    const { contactId } = request.params as { contactId: string };
    const { permissions } = request.body as { permissions: string[] };

    // Can't edit yourself
    if (contactId === user.sub) throw new ValidationError('Cannot change your own permissions');

    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, user.tid), eq(contacts.customerId, user.cid), eq(contacts.portalEnabled, true)))
      .limit(1);
    if (!contact) throw new NotFoundError('Contact', contactId);

    const [updated] = await fastify.db.update(contacts).set({
      portalPermissions: permissions,
      updatedAt: new Date(),
    }).where(eq(contacts.id, contactId)).returning();

    return {
      id: updated.id, portalRole: updated.portalRole, portalPermissions: updated.portalPermissions,
    };
  });

  // Revoke portal access (portal admin)
  fastify.post('/api/v1/portal/users/:contactId/revoke', async (request) => {
    const user = getPortalUser(request);
    if (user.portalRole !== 'admin') throw new ValidationError('Only portal admins can manage users');

    const { contactId } = request.params as { contactId: string };
    if (contactId === user.sub) throw new ValidationError('Cannot revoke your own access');

    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, user.tid), eq(contacts.customerId, user.cid)))
      .limit(1);
    if (!contact) throw new NotFoundError('Contact', contactId);

    await fastify.db.update(contacts).set({
      portalEnabled: false,
      portalPasswordHash: null,
      portalRole: 'user',
      portalPermissions: ['tickets'],
      updatedAt: new Date(),
    }).where(eq(contacts.id, contactId));

    return { success: true };
  });
}
