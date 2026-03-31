import { FastifyInstance } from 'fastify';
import { eq, and, sql, count, desc } from 'drizzle-orm';
import {
  tickets,
  ticketComments,
  ticketTimeEntries,
  tenantSequences,
  users,
  contacts,
} from '@rivertown/db';
import {
  createTicketSchema,
  updateTicketSchema,
  createTicketCommentSchema,
  createTimeEntrySchema,
  paginationSchema,
} from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';
import { moduleEvents } from '../registry.js';
import { determineTimeBillability } from '../contracts/billing-logic.js';

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

export async function ticketRoutes(fastify: FastifyInstance) {
  // List tickets
  fastify.get(
    '/api/v1/tickets',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request) => {
      const query = paginationSchema.parse(request.query);
      const params = request.query as Record<string, string>;
      const { offset, limit } = paginationToOffset(query);

      const conditions = [eq(tickets.tenantId, request.tenantId)];
      if (params.status) conditions.push(eq(tickets.status, params.status));
      if (params.priority) conditions.push(eq(tickets.priority, params.priority));
      if (params.customerId) conditions.push(eq(tickets.customerId, params.customerId));
      if (params.assignedTo) conditions.push(eq(tickets.assignedTo, params.assignedTo));

      const where = and(...conditions);

      const [data, [{ total }]] = await Promise.all([
        fastify.db
          .select()
          .from(tickets)
          .where(where)
          .limit(limit)
          .offset(offset)
          .orderBy(desc(tickets.createdAt)),
        fastify.db.select({ total: count() }).from(tickets).where(where),
      ]);

      return paginate(data, total, query);
    },
  );

  // Get ticket by ID
  fastify.get(
    '/api/v1/tickets/:id',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request) => {
      const { id } = request.params as { id: string };

      const [ticket] = await fastify.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)))
        .limit(1);

      if (!ticket) throw new NotFoundError('Ticket', id);
      return ticket;
    },
  );

  // Create ticket
  fastify.post(
    '/api/v1/tickets',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request, reply) => {
      const body = createTicketSchema.parse(request.body);
      const ticketNumber = await getNextTicketNumber(fastify.db, request.tenantId);

      const [ticket] = await fastify.db
        .insert(tickets)
        .values({
          tenantId: request.tenantId,
          ticketNumber,
          customerId: body.customerId,
          contactId: body.contactId,
          assetId: body.assetId,
          contractId: body.contractId,
          assignedTo: body.assignedTo,
          subject: body.subject,
          description: body.description,
          priority: body.priority,
          ticketType: body.ticketType,
          source: body.source,
        })
        .returning();

      // Calculate and apply SLA
      const { calculateSla } = await import('../../services/sla-calculator.js');
      const sla = await calculateSla(fastify.db, request.tenantId, body.customerId, body.priority ?? 'medium', new Date());
      if (sla.slaPolicyId) {
        await fastify.db.update(tickets).set({
          slaDueAt: sla.slaDueAt,
          slaResponseDueAt: sla.slaResponseDueAt,
          slaResolutionDueAt: sla.slaResolutionDueAt,
          slaPolicyId: sla.slaPolicyId,
        }).where(eq(tickets.id, ticket.id));
        // Update the returned ticket object
        Object.assign(ticket, { slaDueAt: sla.slaDueAt, slaResponseDueAt: sla.slaResponseDueAt, slaResolutionDueAt: sla.slaResolutionDueAt, slaPolicyId: sla.slaPolicyId });
      }

      await logAudit(fastify.db, {
        tenantId: request.tenantId,
        actorType: 'user',
        actorId: request.user.sub,
        action: 'ticket.created',
        entityType: 'ticket',
        entityId: ticket.id,
        ipAddress: request.ip,
      });

      moduleEvents.emit('ticket.created', ticket);

      // Send ticket created email notification (fire and forget)
      import('../../services/email-notifications.js').then(({ sendTicketCreatedEmail }) => {
        sendTicketCreatedEmail(fastify.db, request.tenantId, ticket.id).catch(e => console.error('Ticket created email failed:', e));
      });

      reply.code(201);
      return ticket;
    },
  );

  // Update ticket
  fastify.patch(
    '/api/v1/tickets/:id',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = updateTicketSchema.parse(request.body);

      const [existing] = await fastify.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Ticket', id);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };

      // Auto-set timestamps based on status changes
      if (body.status === 'resolved' && existing.status !== 'resolved') {
        updateData.resolvedAt = new Date();
      }
      if (body.status === 'closed' && existing.status !== 'closed') {
        updateData.closedAt = new Date();
      }

      const [updated] = await fastify.db
        .update(tickets)
        .set(updateData)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)))
        .returning();

      // Recalculate SLA if priority changed
      if (body.priority && body.priority !== existing.priority) {
        const { calculateSla } = await import('../../services/sla-calculator.js');
        const sla = await calculateSla(fastify.db, request.tenantId, existing.customerId, body.priority, new Date(existing.createdAt));
        if (sla.slaPolicyId) {
          await fastify.db.update(tickets).set({
            slaDueAt: sla.slaDueAt,
            slaResponseDueAt: sla.slaResponseDueAt,
            slaResolutionDueAt: sla.slaResolutionDueAt,
            slaPolicyId: sla.slaPolicyId,
          }).where(eq(tickets.id, id));
        }
      }

      // Check SLA breach on resolution + send closed email
      if (body.status === 'resolved' && existing.status !== 'resolved') {
        const now = new Date();
        const breached = existing.slaResolutionDueAt ? now > new Date(existing.slaResolutionDueAt) : false;
        await fastify.db.update(tickets).set({ slaBreached: breached }).where(eq(tickets.id, id));

        import('../../services/email-notifications.js').then(({ sendTicketClosedEmail }) => {
          sendTicketClosedEmail(fastify.db, request.tenantId, id).catch(e => console.error('Ticket closed email failed:', e));
        });
      }

      // Send assigned email when tech changes
      if ((body as any).assignedTo && (body as any).assignedTo !== existing.assignedTo) {
        import('../../services/email-notifications.js').then(({ sendTicketAssignedEmail }) => {
          sendTicketAssignedEmail(fastify.db, request.tenantId, id, request.user.sub).catch(e => console.error('Ticket assigned email failed:', e));
        });
      }

      moduleEvents.emit('ticket.updated', updated, body);
      return updated;
    },
  );

  // List comments
  fastify.get(
    '/api/v1/tickets/:id/comments',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request) => {
      const { id } = request.params as { id: string };

      const rows = await fastify.db
        .select()
        .from(ticketComments)
        .where(
          and(eq(ticketComments.ticketId, id), eq(ticketComments.tenantId, request.tenantId)),
        )
        .orderBy(ticketComments.createdAt);

      // Resolve author names
      const authorIds = [...new Set(rows.filter(r => r.authorId && r.authorId !== '00000000-0000-0000-0000-000000000000').map(r => r.authorId))];
      const nameMap: Record<string, string> = {};
      for (const aid of authorIds) {
        const [user] = await fastify.db.select({ displayName: users.displayName }).from(users).where(eq(users.id, aid)).limit(1);
        if (user) { nameMap[aid] = user.displayName; continue; }
        const [contact] = await fastify.db.select({ firstName: contacts.firstName, lastName: contacts.lastName }).from(contacts).where(eq(contacts.id, aid)).limit(1);
        if (contact) { nameMap[aid] = `${contact.firstName} ${contact.lastName}`; }
      }

      return rows.map(r => ({ ...r, authorName: nameMap[r.authorId] || (r.authorType === 'system' ? 'System' : undefined) }));
    },
  );

  // Add comment
  fastify.post(
    '/api/v1/tickets/:id/comments',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = createTicketCommentSchema.parse(request.body);

      const [comment] = await fastify.db
        .insert(ticketComments)
        .values({
          tenantId: request.tenantId,
          ticketId: id,
          authorType: 'user',
          authorId: request.user.sub,
          body: body.body,
          isInternal: body.isInternal,
        })
        .returning();

      // Update ticket timestamp
      await fastify.db
        .update(tickets)
        .set({ updatedAt: new Date() })
        .where(eq(tickets.id, id));

      // Send reply email to customer (only for non-internal comments from techs)
      if (!body.isInternal) {
        import('../../services/email-notifications.js').then(({ sendTicketReplyEmail }) => {
          sendTicketReplyEmail(fastify.db, request.tenantId, id, body.body).catch(e => console.error('Ticket reply email failed:', e));
        });
      }

      reply.code(201);
      return comment;
    },
  );

  // List time entries for ticket
  fastify.get(
    '/api/v1/tickets/:id/time-entries',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request) => {
      const { id } = request.params as { id: string };

      return fastify.db
        .select()
        .from(ticketTimeEntries)
        .where(
          and(
            eq(ticketTimeEntries.ticketId, id),
            eq(ticketTimeEntries.tenantId, request.tenantId),
          ),
        )
        .orderBy(desc(ticketTimeEntries.startedAt));
    },
  );

  // Add time entry
  fastify.post(
    '/api/v1/tickets/:id/time-entries',
    { preHandler: [fastify.authenticate, requirePermission('time-entries:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = createTimeEntrySchema.parse(request.body);

      const [entry] = await fastify.db
        .insert(ticketTimeEntries)
        .values({
          tenantId: request.tenantId,
          ticketId: id,
          userId: request.user.sub,
          startedAt: new Date(body.startedAt),
          endedAt: body.endedAt ? new Date(body.endedAt) : undefined,
          durationMinutes: body.durationMinutes,
          isBillable: body.isBillable,
          rateCents: body.rateCents,
          notes: body.notes,
        })
        .returning();

      // Auto-determine billability if not explicitly set
      const bodyRaw = request.body as Record<string, unknown>;
      if (bodyRaw.isBillable === undefined || bodyRaw.isBillable === null) {
        const billing = await determineTimeBillability(fastify.db, request.tenantId, id, body.durationMinutes ?? 0);
        if (entry.isBillable !== billing.isBillable || entry.rateCents !== billing.rateCents) {
          const [updated] = await fastify.db.update(ticketTimeEntries).set({
            isBillable: billing.isBillable,
            rateCents: billing.rateCents,
          }).where(eq(ticketTimeEntries.id, entry.id)).returning();
          reply.code(201);
          return { ...updated, billingReason: billing.reason };
        }
      }

      reply.code(201);
      return entry;
    },
  );

  // Update time entry
  fastify.patch(
    '/api/v1/time-entries/:entryId',
    { preHandler: [fastify.authenticate, requirePermission('time-entries:write')] },
    async (request) => {
      const { entryId } = request.params as { entryId: string };
      const body = request.body as Partial<{ durationMinutes: number; isBillable: boolean; rateCents: number; notes: string }>;
      const [updated] = await fastify.db.update(ticketTimeEntries)
        .set({ ...body, updatedAt: new Date() })
        .where(and(eq(ticketTimeEntries.id, entryId), eq(ticketTimeEntries.tenantId, request.tenantId)))
        .returning();
      return updated;
    },
  );

  // Delete time entry
  fastify.delete(
    '/api/v1/time-entries/:entryId',
    { preHandler: [fastify.authenticate, requirePermission('time-entries:write')] },
    async (request, reply) => {
      const { entryId } = request.params as { entryId: string };
      await fastify.db.delete(ticketTimeEntries)
        .where(and(eq(ticketTimeEntries.id, entryId), eq(ticketTimeEntries.tenantId, request.tenantId)));
      reply.code(204).send();
    },
  );

  // Bulk time entries list (all tickets)
  fastify.get(
    '/api/v1/time-entries',
    { preHandler: [fastify.authenticate, requirePermission('time-entries:write')] },
    async (request) => {
      const entries = await fastify.db
        .select({
          id: ticketTimeEntries.id,
          ticketId: ticketTimeEntries.ticketId,
          userId: ticketTimeEntries.userId,
          startedAt: ticketTimeEntries.startedAt,
          endedAt: ticketTimeEntries.endedAt,
          durationMinutes: ticketTimeEntries.durationMinutes,
          isBillable: ticketTimeEntries.isBillable,
          isBilled: ticketTimeEntries.isBilled,
          rateCents: ticketTimeEntries.rateCents,
          notes: ticketTimeEntries.notes,
          createdAt: ticketTimeEntries.createdAt,
          ticketNumber: tickets.ticketNumber,
          ticketSubject: tickets.subject,
          customerId: tickets.customerId,
        })
        .from(ticketTimeEntries)
        .innerJoin(tickets, eq(ticketTimeEntries.ticketId, tickets.id))
        .where(eq(ticketTimeEntries.tenantId, request.tenantId))
        .orderBy(desc(ticketTimeEntries.startedAt))
        .limit(100);

      return entries;
    },
  );
}
