import { FastifyInstance } from 'fastify';
import { eq, and, gte, lte, isNull, desc, count } from 'drizzle-orm';
import { calendarEvents, tickets, users } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';

export async function dispatchRoutes(fastify: FastifyInstance) {
  // Get calendar events for date range
  fastify.get('/api/v1/dispatch/calendar', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const params = request.query as Record<string, string>;
    const startDate = params.startDate ?? new Date().toISOString().split('T')[0];
    const endDate = params.endDate ?? startDate;

    const start = new Date(startDate + 'T00:00:00Z');
    const end = new Date(endDate + 'T23:59:59Z');

    const conditions = [
      eq(calendarEvents.tenantId, request.tenantId),
      gte(calendarEvents.startAt, start),
      lte(calendarEvents.startAt, end),
    ];
    if (params.userId) conditions.push(eq(calendarEvents.userId, params.userId));

    const events = await fastify.db.select().from(calendarEvents)
      .where(and(...conditions))
      .orderBy(calendarEvents.startAt);

    return events;
  });

  // List techs with schedule summary
  fastify.get('/api/v1/dispatch/techs', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    const techList = await fastify.db.select({
      id: users.id,
      displayName: users.displayName,
      email: users.email,
      role: users.role,
    }).from(users)
      .where(and(eq(users.tenantId, request.tenantId), eq(users.isActive, true)))
      .orderBy(users.displayName);

    return techList;
  });

  // Unassigned tickets
  fastify.get('/api/v1/dispatch/unassigned', {
    preHandler: [fastify.authenticate, requirePermission('tickets:read')]
  }, async (request) => {
    return fastify.db.select().from(tickets)
      .where(and(
        eq(tickets.tenantId, request.tenantId),
        isNull(tickets.assignedTo),
      ))
      .orderBy(desc(tickets.createdAt))
      .limit(50);
  });

  // Schedule a ticket
  fastify.post('/api/v1/dispatch/schedule', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const { ticketId, userId, startAt, endAt } = request.body as {
      ticketId: string; userId: string; startAt: string; endAt: string;
    };

    // Get the ticket
    const [ticket] = await fastify.db.select().from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, request.tenantId))).limit(1);
    if (!ticket) throw new NotFoundError('Ticket', ticketId);

    // Get the customer name for the calendar event title
    const { customers } = await import('@rivertown/db');
    const [customer] = await fastify.db.select({ name: customers.name }).from(customers)
      .where(eq(customers.id, ticket.customerId)).limit(1);

    // Create calendar event
    const [event] = await fastify.db.insert(calendarEvents).values({
      tenantId: request.tenantId,
      userId,
      ticketId,
      title: `[#${ticket.ticketNumber}] ${ticket.subject}`,
      description: `Customer: ${customer?.name ?? 'Unknown'}\n${ticket.description ?? ''}`,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      eventType: 'ticket',
    }).returning();

    // Update ticket: assign + schedule + status
    await fastify.db.update(tickets).set({
      assignedTo: userId,
      scheduledStartAt: new Date(startAt),
      scheduledEndAt: new Date(endAt),
      status: 'scheduled',
      updatedAt: new Date(),
    }).where(eq(tickets.id, ticketId));

    // Try to sync to M365 calendar
    try {
      const { syncEventToM365 } = await import('./calendar-sync.js');
      await syncEventToM365(fastify.db, request.tenantId, userId, event);
    } catch { /* calendar sync is best-effort */ }

    reply.code(201);
    return event;
  });

  // Reschedule
  fastify.patch('/api/v1/dispatch/schedule/:eventId', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request) => {
    const { eventId } = request.params as { eventId: string };
    const { startAt, endAt, userId } = request.body as { startAt?: string; endAt?: string; userId?: string };

    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (startAt) update.startAt = new Date(startAt);
    if (endAt) update.endAt = new Date(endAt);
    if (userId) update.userId = userId;

    const [event] = await fastify.db.update(calendarEvents).set(update)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.tenantId, request.tenantId)))
      .returning();

    // Update ticket scheduling too
    if (event.ticketId) {
      const ticketUpdate: Record<string, unknown> = { updatedAt: new Date() };
      if (startAt) ticketUpdate.scheduledStartAt = new Date(startAt);
      if (endAt) ticketUpdate.scheduledEndAt = new Date(endAt);
      if (userId) ticketUpdate.assignedTo = userId;
      await fastify.db.update(tickets).set(ticketUpdate).where(eq(tickets.id, event.ticketId));
    }

    return event;
  });

  // Unschedule
  fastify.delete('/api/v1/dispatch/schedule/:eventId', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const { eventId } = request.params as { eventId: string };

    const [event] = await fastify.db.select().from(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.tenantId, request.tenantId))).limit(1);

    if (event?.ticketId) {
      await fastify.db.update(tickets).set({
        scheduledStartAt: null, scheduledEndAt: null, status: 'open', updatedAt: new Date(),
      }).where(eq(tickets.id, event.ticketId));
    }

    await fastify.db.delete(calendarEvents)
      .where(and(eq(calendarEvents.id, eventId), eq(calendarEvents.tenantId, request.tenantId)));

    reply.code(204).send();
  });
}
