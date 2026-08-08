import { sanitizeBody } from '../../common/sanitize.js';
import crypto from 'crypto';
import { FastifyInstance } from 'fastify';
import { eq, and, or, ilike, count, desc, inArray } from 'drizzle-orm';
import {
  tickets,
  ticketComments,
  ticketTimeEntries,
  ticketExpenses,
  ticketCategories,
  ticketSubcategories,
  ticketTags,
  ticketTagAssignments,
  tenants,
  customers,
  calendarEvents,
  emailMessages,
  csatRatings,
  contracts,
} from '@rivertown/db';
import {
  createTicketSchema,
  updateTicketSchema,
  createTicketCommentSchema,
  createTimeEntrySchema,
  paginationSchema,
} from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError, ValidationError } from '../../common/errors.js';
import { paginationToOffset, paginate } from '../../common/pagination.js';
import { logAudit } from '../../common/audit.js';
import { moduleEvents } from '../registry.js';
import { determineTimeBillability } from '../contracts/billing-logic.js';
import { getNextTicketNumber } from '../../common/ticket-number.js';
import { resolveAuthorNames } from '../../common/author-names.js';
import { broadcastToTenant } from '../../ws/broadcast.js';

export async function ticketRoutes(fastify: FastifyInstance) {
  // Verify a ticket belongs to the caller's tenant, or 404. Used by child-record
  // routes (tags) whose own tables lack a tenant_id column.
  async function assertTicketInTenant(id: string, tenantId: string): Promise<void> {
    const [t] = await fastify.db.select({ id: tickets.id }).from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.tenantId, tenantId))).limit(1);
    if (!t) throw new NotFoundError('Ticket', id);
  }

  // List tickets
  fastify.get(
    '/api/v1/tickets',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request) => {
      const query = paginationSchema.parse(request.query);
      const params = request.query as Record<string, string>;
      const { offset, limit } = paginationToOffset(query);

      const conditions = [eq(tickets.tenantId, request.tenantId)];
      if (params.status) {
        const statusValues = params.status.split(',').map(s => s.trim()).filter(Boolean);
        if (statusValues.length === 1) {
          conditions.push(eq(tickets.status, statusValues[0]));
        } else if (statusValues.length > 1) {
          conditions.push(inArray(tickets.status, statusValues));
        }
      }
      if (params.priority) conditions.push(eq(tickets.priority, params.priority));
      if (params.customerId) conditions.push(eq(tickets.customerId, params.customerId));
      if (params.assignedTo) conditions.push(eq(tickets.assignedTo, params.assignedTo));
      if (params.search?.trim()) {
        const term = params.search.trim();
        const asNumber = parseInt(term.replace(/^#/, ''), 10);
        const subjectMatch = ilike(tickets.subject, `%${term}%`);
        conditions.push(
          Number.isNaN(asNumber)
            ? subjectMatch
            : or(subjectMatch, eq(tickets.ticketNumber, asNumber))!,
        );
      }

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

      // Validate referenced records belong to the caller's tenant before insert
      const [customer] = await fastify.db.select({ id: customers.id }).from(customers)
        .where(and(eq(customers.id, body.customerId), eq(customers.tenantId, request.tenantId))).limit(1);
      if (!customer) throw new NotFoundError('Customer', body.customerId);
      if (body.contractId) {
        const [contract] = await fastify.db.select({ id: contracts.id }).from(contracts)
          .where(and(eq(contracts.id, body.contractId), eq(contracts.tenantId, request.tenantId))).limit(1);
        if (!contract) throw new NotFoundError('Contract', body.contractId);
      }

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
          categoryId: body.categoryId,
          subcategoryId: body.subcategoryId,
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
      broadcastToTenant(request.tenantId, { type: 'ticket.created', ticketId: ticket.id });

      // Evaluate workflow rules for new ticket
      import('../../services/workflow-engine.js').then(({ evaluateWorkflowRules }) => {
        evaluateWorkflowRules(fastify.db, request.tenantId, 'ticket_created', ticket).catch(e => console.error('Workflow error:', e));
      });

      // Send ticket created email notification (fire and forget)
      import('../../services/email-notifications.js').then(({ sendTicketCreatedEmail }) => {
        sendTicketCreatedEmail(fastify.db, request.tenantId, ticket.id).catch(e => console.error('Ticket created email failed:', e));
      });

      // Notify all techs/admins/owners about the new ticket, excluding whoever created it
      import('../../services/notifications.js').then(({ notifyTenantStaff }) => {
        notifyTenantStaff(fastify.db, {
          tenantId: request.tenantId,
          type: 'ticket_created',
          title: `New ticket #${ticket.ticketNumber}`,
          body: ticket.subject,
          entityType: 'ticket',
          entityId: ticket.id,
          excludeUserId: request.user.sub,
        }).catch(() => {});
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
      const rawBody = request.body as Record<string, unknown>;

      const [existing] = await fastify.db
        .select()
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Ticket', id);

      const updateData: Record<string, unknown> = { ...body, updatedAt: new Date() };

      // Explicitly handle contactId from raw body in case validator strips it
      if ('contactId' in rawBody) {
        updateData.contactId = rawBody.contactId ?? null;
      }

      // Customer reassignment: clear references that belong to the old customer
      // unless the request explicitly sets them
      if (body.customerId && body.customerId !== existing.customerId) {
        const [newCustomer] = await fastify.db.select({ id: customers.id }).from(customers)
          .where(and(eq(customers.id, body.customerId), eq(customers.tenantId, request.tenantId))).limit(1);
        if (!newCustomer) throw new NotFoundError('Customer', body.customerId);
        if (!('contactId' in rawBody)) updateData.contactId = null;
        if (!('assetId' in rawBody)) updateData.assetId = null;
        if (!('contractId' in rawBody)) updateData.contractId = null;
      }

      // Auto-set timestamps based on status changes
      if (body.status === 'resolved' && existing.status !== 'resolved') {
        updateData.resolvedAt = new Date();
      }
      if (body.status === 'closed' && existing.status !== 'closed') {
        updateData.closedAt = new Date();
      }

      // SLA pause/resume logic when entering/leaving waiting_on_customer
      if (body.status && body.status !== existing.status) {
        const [tenant] = await fastify.db.select({ settings: tenants.settings })
          .from(tenants).where(eq(tenants.id, request.tenantId)).limit(1);
        const tenantSettings = (tenant?.settings ?? {}) as Record<string, unknown>;

        if (tenantSettings.ticketSlaPauseOnWaiting !== false) {
          if (body.status === 'waiting_on_customer' && existing.status !== 'waiting_on_customer') {
            // Entering waiting_on_customer — pause SLA
            updateData.slaPausedAt = new Date();
          } else if (existing.status === 'waiting_on_customer' && body.status !== 'waiting_on_customer') {
            // Leaving waiting_on_customer — accumulate paused time and clear pause
            const now = new Date();
            const pausedAt = existing.slaPausedAt ? new Date(existing.slaPausedAt) : null;
            const additionalPaused = pausedAt ? (now.getTime() - pausedAt.getTime()) : 0;
            updateData.slaTotalPausedMs = (existing.slaTotalPausedMs ?? 0) + additionalPaused;
            updateData.slaPausedAt = null;
          }
        }
      }

      const [updated] = await fastify.db
        .update(tickets)
        .set(updateData)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)))
        .returning();

      // Recalculate SLA if priority or customer changed
      if ((body.priority && body.priority !== existing.priority) || (body.customerId && body.customerId !== existing.customerId)) {
        const { calculateSla } = await import('../../services/sla-calculator.js');
        const sla = await calculateSla(fastify.db, request.tenantId, body.customerId ?? existing.customerId, body.priority ?? existing.priority, new Date(existing.createdAt));
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
        const totalPaused = (existing.slaTotalPausedMs ?? 0) +
          (existing.slaPausedAt ? (now.getTime() - new Date(existing.slaPausedAt).getTime()) : 0);
        const adjustedDueAt = existing.slaResolutionDueAt
          ? new Date(new Date(existing.slaResolutionDueAt).getTime() + totalPaused)
          : null;
        const breached = adjustedDueAt ? now > adjustedDueAt : false;
        await fastify.db.update(tickets).set({ slaBreached: breached }).where(eq(tickets.id, id));

        // Create CSAT rating record with unique token
        const csatToken = crypto.randomUUID();
        await fastify.db.insert(csatRatings).values({
          tenantId: request.tenantId,
          ticketId: id,
          contactId: existing.contactId,
          token: csatToken,
        }).catch(() => {}); // Don't fail ticket resolution if CSAT insert fails

        import('../../services/email-notifications.js').then(({ sendTicketClosedEmail }) => {
          sendTicketClosedEmail(fastify.db, request.tenantId, id).catch(e => console.error('Ticket closed email failed:', e));
        });
      }

      // Send assigned email when tech changes
      if ((body as any).assignedTo && (body as any).assignedTo !== existing.assignedTo) {
        import('../../services/email-notifications.js').then(({ sendTicketAssignedEmail }) => {
          sendTicketAssignedEmail(fastify.db, request.tenantId, id, request.user.sub).catch(e => console.error('Ticket assigned email failed:', e));
        });
        import('../../services/notifications.js').then(({ createNotification }) => {
          createNotification(fastify.db, {
            tenantId: request.tenantId,
            userId: (body as any).assignedTo,
            type: 'ticket_assigned',
            title: `Ticket #${existing.ticketNumber} assigned to you`,
            body: existing.subject,
            entityType: 'ticket',
            entityId: id,
          }).catch(() => {});
        });
      }

      moduleEvents.emit('ticket.updated', updated, body);
      broadcastToTenant(request.tenantId, { type: 'ticket.updated', ticketId: id });

      // Evaluate workflow rules for updated ticket
      import('../../services/workflow-engine.js').then(({ evaluateWorkflowRules }) => {
        evaluateWorkflowRules(fastify.db, request.tenantId, 'ticket_updated', updated, body as Record<string, unknown>).catch(e => console.error('Workflow error:', e));
      });

      // Trigger status-specific workflow rules
      if (body.status && body.status !== existing.status) {
        import('../../services/workflow-engine.js').then(({ evaluateWorkflowRules }) => {
          evaluateWorkflowRules(fastify.db, request.tenantId, 'ticket_status_changed', updated, body as Record<string, unknown>).catch(e => console.error('Workflow error:', e));
          // Fire specific status triggers
          if (body.status === 'resolved') evaluateWorkflowRules(fastify.db, request.tenantId, 'ticket_resolved', updated).catch(() => {});
          if (body.status === 'closed') evaluateWorkflowRules(fastify.db, request.tenantId, 'ticket_closed', updated).catch(() => {});
        });
      }

      // Priority changed trigger
      if (body.priority && body.priority !== existing.priority) {
        import('../../services/workflow-engine.js').then(({ evaluateWorkflowRules }) => {
          evaluateWorkflowRules(fastify.db, request.tenantId, 'priority_changed', updated, body as Record<string, unknown>).catch(() => {});
        });
      }

      // Assignment changed trigger
      if (body.assignedTo !== undefined && body.assignedTo !== existing.assignedTo) {
        import('../../services/workflow-engine.js').then(({ evaluateWorkflowRules }) => {
          evaluateWorkflowRules(fastify.db, request.tenantId, 'assigned_changed', updated, body as Record<string, unknown>).catch(() => {});
        });
      }

      return updated;
    },
  );

  // Delete ticket
  fastify.delete(
    '/api/v1/tickets/:id',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [existing] = await fastify.db.select().from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId))).limit(1);
      if (!existing) throw new NotFoundError('Ticket', id);

      // Delete all child records that reference this ticket
      await fastify.db.delete(csatRatings).where(eq(csatRatings.ticketId, id));
      await fastify.db.delete(ticketTagAssignments).where(eq(ticketTagAssignments.ticketId, id));
      await fastify.db.delete(ticketExpenses).where(eq(ticketExpenses.ticketId, id));
      await fastify.db.delete(ticketTimeEntries).where(eq(ticketTimeEntries.ticketId, id));
      await fastify.db.delete(ticketComments).where(eq(ticketComments.ticketId, id));
      await fastify.db.update(calendarEvents).set({ ticketId: null }).where(eq(calendarEvents.ticketId, id));
      await fastify.db.update(emailMessages).set({ ticketId: null }).where(eq(emailMessages.ticketId, id));
      await fastify.db.delete(tickets).where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)));

      await logAudit(fastify.db, {
        tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
        action: 'ticket.deleted', entityType: 'ticket', entityId: id, ipAddress: request.ip,
      });

      reply.code(204).send();
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

      // Resolve author names (batched)
      const nameMap = await resolveAuthorNames(fastify.db, rows.map(r => r.authorId));

      return rows.map(r => ({ ...r, authorName: nameMap[r.authorId] || (r.authorType === 'system' ? 'System' : undefined) }));
    },
  );

  // Add comment
  fastify.post(
    '/api/v1/tickets/:id/comments',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await assertTicketInTenant(id, request.tenantId);
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

      broadcastToTenant(request.tenantId, { type: 'ticket.comment.created', ticketId: id });

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
      await assertTicketInTenant(id, request.tenantId);
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
        .set({ ...sanitizeBody(body), updatedAt: new Date() })
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

  // ===== TICKET EXPENSES =====

  // List expenses for ticket
  fastify.get(
    '/api/v1/tickets/:id/expenses',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request) => {
      const { id } = request.params as { id: string };

      return fastify.db
        .select()
        .from(ticketExpenses)
        .where(
          and(
            eq(ticketExpenses.ticketId, id),
            eq(ticketExpenses.tenantId, request.tenantId),
          ),
        )
        .orderBy(desc(ticketExpenses.expenseDate));
    },
  );

  // Create expense
  fastify.post(
    '/api/v1/tickets/:id/expenses',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await assertTicketInTenant(id, request.tenantId);
      const body = request.body as {
        expenseType: string;
        description?: string;
        amountCents: number;
        quantity?: string;
        isBillable?: boolean;
        expenseDate?: string;
      };

      const [expense] = await fastify.db
        .insert(ticketExpenses)
        .values({
          tenantId: request.tenantId,
          ticketId: id,
          userId: request.user.sub,
          expenseType: body.expenseType,
          description: body.description,
          amountCents: body.amountCents,
          quantity: body.quantity,
          isBillable: body.isBillable,
          expenseDate: body.expenseDate ?? new Date().toISOString().split('T')[0],
        })
        .returning();

      reply.code(201);
      return expense;
    },
  );

  // Update expense
  fastify.patch(
    '/api/v1/expenses/:id',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request) => {
      const { id } = request.params as { id: string };
      const body = request.body as Partial<{
        expenseType: string;
        description: string;
        amountCents: number;
        quantity: string;
        isBillable: boolean;
        isBilled: boolean;
        expenseDate: string;
      }>;

      const [updated] = await fastify.db
        .update(ticketExpenses)
        .set({ ...sanitizeBody(body), updatedAt: new Date() })
        .where(and(eq(ticketExpenses.id, id), eq(ticketExpenses.tenantId, request.tenantId)))
        .returning();

      return updated;
    },
  );

  // Delete expense
  fastify.delete(
    '/api/v1/expenses/:id',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      await fastify.db
        .delete(ticketExpenses)
        .where(and(eq(ticketExpenses.id, id), eq(ticketExpenses.tenantId, request.tenantId)));
      reply.code(204).send();
    },
  );

  // List ticket categories with subcategories
  fastify.get(
    '/api/v1/ticket-categories',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request) => {
      const categories = await fastify.db
        .select()
        .from(ticketCategories)
        .where(and(eq(ticketCategories.tenantId, request.tenantId), eq(ticketCategories.isActive, true)))
        .orderBy(ticketCategories.sortOrder);

      const subcategories = await fastify.db
        .select()
        .from(ticketSubcategories)
        .where(and(eq(ticketSubcategories.tenantId, request.tenantId), eq(ticketSubcategories.isActive, true)))
        .orderBy(ticketSubcategories.sortOrder);

      return categories.map((cat) => ({
        ...cat,
        subcategories: subcategories.filter((sub) => sub.categoryId === cat.id),
      }));
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

  // Bulk update tickets
  fastify.post('/api/v1/tickets/bulk-update', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request) => {
    const { ids, update } = request.body as { ids: string[]; update: Record<string, unknown> };
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
      throw new ValidationError('ids must be an array of 1-500 items');
    }
    // Whitelist writable columns — never trust the raw body (mass-assignment guard)
    const parsed = updateTicketSchema.parse(update ?? {});
    const updateData: Record<string, unknown> = { ...sanitizeBody(parsed), updatedAt: new Date() };
    for (const id of ids) {
      await fastify.db.update(tickets).set(updateData)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)));
    }
    return { updated: ids.length };
  });

  // Bulk delete tickets
  fastify.post('/api/v1/tickets/bulk-delete', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request, reply) => {
    const { ids } = request.body as { ids: string[] };
    if (!Array.isArray(ids) || ids.length === 0 || ids.length > 500) {
      throw new ValidationError('ids must be an array of 1-500 items');
    }
    let deletedCount = 0;
    for (const id of ids) {
      // Verify ticket belongs to tenant first
      const [ticket] = await fastify.db.select({ id: tickets.id }).from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId))).limit(1);
      if (!ticket) continue; // Skip tickets that don't belong to this tenant

      // Now safe to delete children
      await fastify.db.delete(csatRatings).where(eq(csatRatings.ticketId, id));
      await fastify.db.delete(ticketTagAssignments).where(eq(ticketTagAssignments.ticketId, id));
      await fastify.db.delete(ticketExpenses).where(eq(ticketExpenses.ticketId, id));
      await fastify.db.delete(ticketTimeEntries).where(eq(ticketTimeEntries.ticketId, id));
      await fastify.db.delete(ticketComments).where(eq(ticketComments.ticketId, id));
      await fastify.db.update(calendarEvents).set({ ticketId: null }).where(eq(calendarEvents.ticketId, id));
      await fastify.db.update(emailMessages).set({ ticketId: null }).where(eq(emailMessages.ticketId, id));
      await fastify.db.delete(tickets).where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)));
      deletedCount++;
    }
    return { deleted: deletedCount };
  });

  // Merge ticket into another
  fastify.post('/api/v1/tickets/:id/merge', {
    preHandler: [fastify.authenticate, requirePermission('tickets:write')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { targetTicketId } = request.body as { targetTicketId: string };

    // Verify both tickets exist and belong to tenant
    const [source] = await fastify.db.select().from(tickets).where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId))).limit(1);
    const [target] = await fastify.db.select().from(tickets).where(and(eq(tickets.id, targetTicketId), eq(tickets.tenantId, request.tenantId))).limit(1);
    if (!source || !target) throw new NotFoundError('Ticket', !source ? id : targetTicketId);

    if (id === targetTicketId) throw new ValidationError('Cannot merge a ticket into itself');
    if (source.mergedIntoId) throw new ValidationError('Source ticket is already merged');
    if (target.mergedIntoId) throw new ValidationError('Target ticket is already merged');

    // Move comments from source to target
    await fastify.db.update(ticketComments).set({ ticketId: targetTicketId }).where(eq(ticketComments.ticketId, id));
    // Move time entries from source to target
    await fastify.db.update(ticketTimeEntries).set({ ticketId: targetTicketId }).where(eq(ticketTimeEntries.ticketId, id));
    // Add system comment to target
    await fastify.db.insert(ticketComments).values({
      tenantId: request.tenantId, ticketId: targetTicketId,
      authorType: 'system', authorId: request.user.sub,
      body: `Ticket #${source.ticketNumber} "${source.subject}" was merged into this ticket.`,
      isInternal: true,
    });
    // Close source ticket
    await fastify.db.update(tickets).set({
      status: 'closed', closedAt: new Date(), mergedIntoId: targetTicketId, updatedAt: new Date(),
    }).where(eq(tickets.id, id));

    return { success: true, sourceTicketId: id, targetTicketId };
  });

  // ===== TICKET TAG ASSIGNMENTS =====

  // List tags on a ticket
  fastify.get(
    '/api/v1/tickets/:id/tags',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request) => {
      const { id } = request.params as { id: string };
      await assertTicketInTenant(id, request.tenantId);
      const assignments = await fastify.db
        .select({
          id: ticketTagAssignments.id,
          tagId: ticketTagAssignments.tagId,
          name: ticketTags.name,
          color: ticketTags.color,
          createdAt: ticketTagAssignments.createdAt,
        })
        .from(ticketTagAssignments)
        .innerJoin(ticketTags, eq(ticketTagAssignments.tagId, ticketTags.id))
        .where(and(eq(ticketTagAssignments.ticketId, id), eq(ticketTags.tenantId, request.tenantId)));
      return assignments;
    },
  );

  // Add tag to a ticket
  fastify.post(
    '/api/v1/tickets/:id/tags',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const { tagId } = request.body as { tagId: string };
      await assertTicketInTenant(id, request.tenantId);
      // Ensure the tag also belongs to this tenant before linking
      const [tag] = await fastify.db.select({ id: ticketTags.id }).from(ticketTags)
        .where(and(eq(ticketTags.id, tagId), eq(ticketTags.tenantId, request.tenantId))).limit(1);
      if (!tag) throw new NotFoundError('Tag', tagId);
      const [assignment] = await fastify.db.insert(ticketTagAssignments).values({
        ticketId: id,
        tagId,
      }).returning();
      reply.code(201);
      return assignment;
    },
  );

  // Remove tag from a ticket
  fastify.delete(
    '/api/v1/tickets/:id/tags/:tagId',
    { preHandler: [fastify.authenticate, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id, tagId } = request.params as { id: string; tagId: string };
      await assertTicketInTenant(id, request.tenantId);
      await fastify.db.delete(ticketTagAssignments)
        .where(and(eq(ticketTagAssignments.ticketId, id), eq(ticketTagAssignments.tagId, tagId)));
      reply.code(204).send();
    },
  );

  // ===== CSAT (Customer Satisfaction) — Public endpoints (no auth) =====

  // Get CSAT info by token (public, no auth)
  fastify.get('/api/v1/csat/:token', async (request) => {
    const { token } = request.params as { token: string };
    const [existing] = await fastify.db.select({
      id: csatRatings.id,
      ticketId: csatRatings.ticketId,
      rating: csatRatings.rating,
      comment: csatRatings.comment,
      ticketNumber: tickets.ticketNumber,
      ticketSubject: tickets.subject,
    }).from(csatRatings)
      .innerJoin(tickets, eq(csatRatings.ticketId, tickets.id))
      .where(eq(csatRatings.token, token)).limit(1);

    if (!existing) throw new NotFoundError('Rating', token);
    return existing;
  });

  // Submit/update CSAT rating (public, no auth — uses token)
  fastify.put('/api/v1/csat/:token', async (request) => {
    const { token } = request.params as { token: string };
    const { rating, comment } = request.body as { rating: number; comment?: string };

    if (rating < 1 || rating > 3) throw new ValidationError('Rating must be 1, 2, or 3');

    const [existing] = await fastify.db.select().from(csatRatings)
      .where(eq(csatRatings.token, token)).limit(1);

    if (!existing) throw new NotFoundError('Rating', token);

    await fastify.db.update(csatRatings).set({
      rating,
      comment: comment ?? existing.comment,
      updatedAt: new Date(),
    }).where(eq(csatRatings.token, token));

    return { success: true };
  });

  // CSAT rating page (public HTML — customer clicks from email)
  fastify.get('/api/v1/csat/:token/page', async (request, reply) => {
    const { token } = request.params as { token: string };
    const [record] = await fastify.db.select({
      id: csatRatings.id,
      rating: csatRatings.rating,
      comment: csatRatings.comment,
      ticketNumber: tickets.ticketNumber,
      ticketSubject: tickets.subject,
    }).from(csatRatings)
      .innerJoin(tickets, eq(csatRatings.ticketId, tickets.id))
      .where(eq(csatRatings.token, token)).limit(1);

    if (!record) {
      reply.type('text/html').send('<html><body><h2>Rating not found</h2></body></html>');
      return;
    }

    const apiBase = process.env.API_BASE_URL || '';
    const currentRating = record.rating;

    const html = `<!DOCTYPE html>
<html><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rate Your Experience</title>
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:-apple-system,system-ui,sans-serif; background:#f3f4f6; min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
  .card { background:white; border-radius:16px; padding:40px; max-width:480px; width:100%; box-shadow:0 4px 24px rgba(0,0,0,0.08); text-align:center; }
  h1 { font-size:20px; color:#111827; margin-bottom:4px; }
  .ticket { font-size:14px; color:#6b7280; margin-bottom:24px; }
  .smileys { display:flex; gap:16px; justify-content:center; margin-bottom:24px; }
  .smiley { width:80px; height:80px; border-radius:50%; border:3px solid #e5e7eb; display:flex; align-items:center; justify-content:center; font-size:40px; cursor:pointer; transition:all 0.2s; background:white; }
  .smiley:hover { transform:scale(1.1); }
  .smiley.selected { border-width:3px; transform:scale(1.15); box-shadow:0 4px 12px rgba(0,0,0,0.15); }
  .smiley.s1.selected { border-color:#ef4444; background:#fef2f2; }
  .smiley.s2.selected { border-color:#f59e0b; background:#fffbeb; }
  .smiley.s3.selected { border-color:#22c55e; background:#f0fdf4; }
  textarea { width:100%; border:1px solid #d1d5db; border-radius:8px; padding:12px; font-size:14px; resize:vertical; min-height:80px; margin-bottom:16px; font-family:inherit; }
  textarea:focus { outline:none; border-color:#3b82f6; box-shadow:0 0 0 3px rgba(59,130,246,0.1); }
  .btn { background:#3b82f6; color:white; border:none; padding:12px 32px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; transition:background 0.2s; }
  .btn:hover { background:#2563eb; }
  .btn:disabled { background:#9ca3af; cursor:not-allowed; }
  .success { color:#22c55e; font-weight:600; margin-top:12px; display:none; }
  .label { font-size:12px; color:#9ca3af; margin-top:4px; }
</style>
</head><body>
<div class="card">
  <h1>How was your experience?</h1>
  <p class="ticket">Ticket #${record.ticketNumber} &mdash; ${(record.ticketSubject ?? '').substring(0, 60).replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>
  <div class="smileys">
    <div class="smiley s1 ${currentRating === 1 ? 'selected' : ''}" onclick="selectRating(1)" title="Unhappy">&#128542;</div>
    <div class="smiley s2 ${currentRating === 2 ? 'selected' : ''}" onclick="selectRating(2)" title="Neutral">&#128528;</div>
    <div class="smiley s3 ${currentRating === 3 ? 'selected' : ''}" onclick="selectRating(3)" title="Happy">&#128522;</div>
  </div>
  <div class="smileys" style="margin-top:-16px;margin-bottom:24px;">
    <div class="label" style="width:80px">Unhappy</div>
    <div class="label" style="width:80px">Okay</div>
    <div class="label" style="width:80px">Great!</div>
  </div>
  <textarea id="comment" placeholder="Any additional feedback? (optional)">${(record.comment ?? '').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</textarea>
  <button class="btn" id="submitBtn" onclick="submitRating()">Submit Feedback</button>
  <p class="success" id="successMsg">Thank you for your feedback!</p>
</div>
<script>
let selectedRating = ${currentRating || 0};
function selectRating(r) {
  selectedRating = r;
  document.querySelectorAll('.smiley').forEach(function(el, i) {
    el.classList.toggle('selected', i + 1 === r);
  });
}
async function submitRating() {
  if (!selectedRating) { alert('Please select a rating'); return; }
  var comment = document.getElementById('comment').value;
  var btn = document.getElementById('submitBtn');
  btn.disabled = true; btn.textContent = 'Submitting...';
  try {
    var res = await fetch('${apiBase}/api/v1/csat/${token}', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rating: selectedRating, comment: comment }),
    });
    if (res.ok) {
      document.getElementById('successMsg').style.display = 'block';
      btn.textContent = 'Updated!';
      setTimeout(function() { btn.disabled = false; btn.textContent = 'Update Feedback'; }, 2000);
    }
  } catch(e) { btn.disabled = false; btn.textContent = 'Submit Feedback'; }
}
</script>
</body></html>`;

    reply.type('text/html').send(html);
  });
}
