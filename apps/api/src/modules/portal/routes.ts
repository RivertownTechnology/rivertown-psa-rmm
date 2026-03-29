import { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { compare } from 'bcryptjs';
import { contacts, tickets, ticketComments, quotes, invoices, assets } from '@rivertown/db';

export async function portalRoutes(fastify: FastifyInstance) {
  // Portal login
  fastify.post('/api/v1/portal/auth/login', { config: { public: true } as any }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [contact] = await fastify.db.select().from(contacts)
      .where(eq(contacts.email, email.toLowerCase())).limit(1);

    if (!contact || !contact.portalEnabled || !contact.portalPasswordHash) {
      reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid credentials' }); return;
    }

    const valid = await compare(password, contact.portalPasswordHash);
    if (!valid) return { error: 'Invalid credentials' };

    const accessToken = fastify.jwt.sign(
      { sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', type: 'access' as const },
      { expiresIn: '4h' },
    );

    const refreshToken = fastify.jwt.sign(
      { sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', type: 'refresh' as const },
      { expiresIn: '7d' },
    );

    return {
      accessToken,
      refreshToken,
      user: { id: contact.id, name: `${contact.firstName} ${contact.lastName}`, email: contact.email },
      customerId: contact.customerId,
    };
  });

  // Portal tickets
  fastify.get('/api/v1/portal/tickets', async (request) => {
    const user = request.user as any;
    const data = await fastify.db.select().from(tickets)
      .where(and(eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)))
      .orderBy(desc(tickets.createdAt)).limit(50);
    return data;
  });

  // Portal create ticket
  fastify.post('/api/v1/portal/tickets', async (request) => {
    const user = request.user as any;
    const { subject, description } = request.body as { subject: string; description?: string };
    // Simple auto-number
    const [ticket] = await fastify.db.insert(tickets).values({
      tenantId: user.tid, ticketNumber: Date.now() % 100000, customerId: user.cid,
      contactId: user.sub, subject, description, status: 'new', priority: 'medium',
      ticketType: 'service_request', source: 'portal',
    }).returning();
    return ticket;
  });

  // Portal ticket comments
  fastify.get('/api/v1/portal/tickets/:id/comments', async (request) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    return fastify.db.select().from(ticketComments)
      .where(and(eq(ticketComments.ticketId, id), eq(ticketComments.tenantId, user.tid), eq(ticketComments.isInternal, false)))
      .orderBy(ticketComments.createdAt);
  });

  fastify.post('/api/v1/portal/tickets/:id/comments', async (request) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    const { body } = request.body as { body: string };
    const [comment] = await fastify.db.insert(ticketComments).values({
      tenantId: user.tid, ticketId: id, authorType: 'contact', authorId: user.sub,
      body, isInternal: false,
    }).returning();
    return comment;
  });

  // Portal quotes
  fastify.get('/api/v1/portal/quotes', async (request) => {
    const user = request.user as any;
    return fastify.db.select().from(quotes)
      .where(and(eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid)))
      .orderBy(desc(quotes.createdAt)).limit(50);
  });

  fastify.post('/api/v1/portal/quotes/:id/approve', async (request) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    const [updated] = await fastify.db.update(quotes).set({ status: 'approved', approvedAt: new Date(), approvedBy: user.sub, updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid))).returning();
    return updated;
  });

  fastify.post('/api/v1/portal/quotes/:id/reject', async (request) => {
    const { id } = request.params as { id: string };
    const user = request.user as any;
    const [updated] = await fastify.db.update(quotes).set({ status: 'rejected', updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid))).returning();
    return updated;
  });

  // Portal invoices
  fastify.get('/api/v1/portal/invoices', async (request) => {
    const user = request.user as any;
    return fastify.db.select().from(invoices)
      .where(and(eq(invoices.tenantId, user.tid), eq(invoices.customerId, user.cid)))
      .orderBy(desc(invoices.createdAt)).limit(50);
  });

  // Portal assets
  fastify.get('/api/v1/portal/assets', async (request) => {
    const user = request.user as any;
    return fastify.db.select().from(assets)
      .where(and(eq(assets.tenantId, user.tid), eq(assets.customerId, user.cid)))
      .orderBy(assets.name).limit(100);
  });
}
