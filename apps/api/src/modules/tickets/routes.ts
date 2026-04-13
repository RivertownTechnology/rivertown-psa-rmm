import { FastifyInstance } from 'fastify';
import { eq, and, sql, count, desc, inArray } from 'drizzle-orm';
import {
  tickets,
  ticketComments,
  ticketTimeEntries,
  ticketCategories,
  ticketSubcategories,
  tenantSequences,
  users,
  contacts,
  contracts,
  contractLineItems,
  customers,
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
import { resolveTimeEntry, ResolveError, liveBlockBalanceHours } from '../contracts/billing-logic.js';

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

  // Charge-to options for a ticket — drives the tech's "Charge to" dropdown.
  // Returns: every active contract line item for this ticket's customer, plus the
  // tenant's Internal/Overhead line. Block lines include live remaining hours so
  // the tech can see the balance before logging.
  fastify.get(
    '/api/v1/tickets/:id/charge-to-options',
    { preHandler: [fastify.authenticate, requirePermission('tickets:read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const [ticket] = await fastify.db
        .select({
          customerId: tickets.customerId,
          contractId: tickets.contractId,
        })
        .from(tickets)
        .where(and(eq(tickets.id, id), eq(tickets.tenantId, request.tenantId)))
        .limit(1);
      if (!ticket) {
        reply.code(404);
        return { error: 'not_found' };
      }

      // 1. Customer's active contracts + their line items
      const customerLines = await fastify.db
        .select({
          contractId: contracts.id,
          contractName: contracts.name,
          defaultLaborLineItemId: contracts.defaultLaborLineItemId,
          lineItemId: contractLineItems.id,
          lineItemDescription: contractLineItems.description,
          coveragePolicy: contractLineItems.coveragePolicy,
          unitPriceCents: contractLineItems.unitPriceCents,
          overageRateCents: contractLineItems.overageRateCents,
          blockHours: contractLineItems.blockHours,
          expiresAt: contractLineItems.expiresAt,
          warnAtPct: contractLineItems.warnAtPct,
          periodStartDate: contractLineItems.periodStartDate,
        })
        .from(contractLineItems)
        .innerJoin(contracts, eq(contractLineItems.contractId, contracts.id))
        .where(
          and(
            eq(contracts.tenantId, request.tenantId),
            eq(contracts.customerId, ticket.customerId),
            eq(contracts.status, 'active'),
          ),
        );

      // 2. Per-tenant Internal/Overhead line — every tenant has one (seeded).
      const internalCustomerSubquery = fastify.db
        .select({ id: customers.id })
        .from(customers)
        .where(and(eq(customers.tenantId, request.tenantId), eq(customers.name, 'Internal')));

      const internalLines = await fastify.db
        .select({
          contractId: contracts.id,
          contractName: contracts.name,
          defaultLaborLineItemId: contracts.defaultLaborLineItemId,
          lineItemId: contractLineItems.id,
          lineItemDescription: contractLineItems.description,
          coveragePolicy: contractLineItems.coveragePolicy,
          unitPriceCents: contractLineItems.unitPriceCents,
          overageRateCents: contractLineItems.overageRateCents,
          blockHours: contractLineItems.blockHours,
          expiresAt: contractLineItems.expiresAt,
          warnAtPct: contractLineItems.warnAtPct,
          periodStartDate: contractLineItems.periodStartDate,
        })
        .from(contractLineItems)
        .innerJoin(contracts, eq(contractLineItems.contractId, contracts.id))
        .where(
          and(
            eq(contracts.tenantId, request.tenantId),
            inArray(contracts.customerId, internalCustomerSubquery),
            eq(contracts.name, 'Internal Operations'),
          ),
        );

      // 3. For block lines, pull live remaining hours via the shared helper so
      // periodStartDate is honored consistently with the resolver.
      const remainingByLine = new Map<string, number>();
      for (const line of [...customerLines, ...internalLines]) {
        if (line.coveragePolicy === 'block' && line.blockHours) {
          const remaining = await liveBlockBalanceHours(fastify.db as any, {
            id: line.lineItemId,
            blockHours: line.blockHours,
            tenantId: request.tenantId,
            periodStartDate: line.periodStartDate ?? null,
          });
          remainingByLine.set(line.lineItemId, remaining);
        }
      }

      const decorate = (line: typeof customerLines[number], isInternal: boolean) => {
        const isBlock = line.coveragePolicy === 'block' && !!line.blockHours;
        const totalHours = isBlock ? parseFloat(line.blockHours ?? '0') : null;
        const remainingHours = isBlock ? remainingByLine.get(line.lineItemId) ?? totalHours : null;
        return {
          contractId: line.contractId,
          contractName: line.contractName,
          lineItemId: line.lineItemId,
          lineItemDescription: line.lineItemDescription,
          coveragePolicy: line.coveragePolicy,
          isContractDefault: line.defaultLaborLineItemId === line.lineItemId,
          isInternal,
          rateCents: line.coveragePolicy === 'billable' ? line.unitPriceCents : null,
          overageRateCents: line.overageRateCents ?? null,
          blockHoursTotal: totalHours,
          blockHoursRemaining: remainingHours,
          expiresAt: line.expiresAt,
          warnAtPct: line.warnAtPct,
        };
      };

      // Suggested default: ticket.contractId's default labor line, if any.
      const suggestedLine = customerLines.find(
        (l) => l.contractId === ticket.contractId && l.defaultLaborLineItemId === l.lineItemId,
      );

      return {
        ticketContractId: ticket.contractId ?? null,
        suggestedLineItemId: suggestedLine?.lineItemId ?? null,
        options: [
          ...customerLines.map((l) => decorate(l, false)),
          ...internalLines.map((l) => decorate(l, true)),
        ],
      };
    },
  );

  // Add time entry — resolver-driven, transactional, may insert two rows for block overage splits.
  fastify.post(
    '/api/v1/tickets/:id/time-entries',
    { preHandler: [fastify.authenticate, requirePermission('time-entries:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = createTimeEntrySchema.parse(request.body);

      const startedAt = new Date(body.startedAt);
      const endedAt = body.endedAt ? new Date(body.endedAt) : undefined;
      const durationMinutes =
        body.durationMinutes ??
        (endedAt ? Math.max(1, Math.round((endedAt.getTime() - startedAt.getTime()) / 60000)) : undefined);

      if (!durationMinutes || durationMinutes <= 0) {
        reply.code(400);
        return { error: 'duration_required', message: 'durationMinutes (or endedAt) is required and must be > 0' };
      }

      try {
        const result = await fastify.db.transaction(async (tx) => {
          const resolved = await resolveTimeEntry(tx as any, {
            tenantId: request.tenantId,
            ticketId: id,
            userId: request.user.sub,
            durationMinutes,
            contractLineItemId: body.contractLineItemId,
            classification: body.classification,
            internalCategory: body.internalCategory,
            nonBillableReason: body.nonBillableReason,
          });

          // Multiple resolved entries = overage split. The covered portion gets the
          // provided startedAt; the overage portion picks up where it left off.
          const inserts = resolved.entries.map((re, idx) => {
            const offsetMinutes = resolved.entries
              .slice(0, idx)
              .reduce((sum, e) => sum + e.durationMinutes, 0);
            const partStarted = new Date(startedAt.getTime() + offsetMinutes * 60000);
            const partEnded = new Date(partStarted.getTime() + re.durationMinutes * 60000);
            return {
              tenantId: request.tenantId,
              ticketId: id,
              userId: request.user.sub,
              startedAt: partStarted,
              endedAt: endedAt ? partEnded : undefined,
              durationMinutes: re.durationMinutes,
              contractId: re.contractId,
              contractLineItemId: re.contractLineItemId,
              classification: re.classification,
              internalCategory: re.internalCategory,
              nonBillableReason: re.nonBillableReason,
              costRateCents: re.costRateCents,
              billRateCents: re.billRateCents,
              costCents: re.costCents,
              billableCents: re.billableCents,
              isBillable: re.isBillable,
              rateCents: re.rateCents,
              notes: body.notes,
            };
          });

          const inserted = await tx.insert(ticketTimeEntries).values(inserts).returning();
          for (const row of inserted) {
            await logAudit(tx as any, {
              tenantId: request.tenantId,
              actorType: 'user',
              actorId: request.user.sub,
              action: 'time_entry.created',
              entityType: 'time_entry',
              entityId: row.id,
              changes: {
                classification: { old: null, new: row.classification },
                contractLineItemId: { old: null, new: row.contractLineItemId },
                durationMinutes: { old: null, new: row.durationMinutes },
                billableCents: { old: null, new: row.billableCents },
              },
              ipAddress: request.ip,
            });
          }
          return { inserted, reason: resolved.reason, warning: resolved.warning };
        });

        reply.code(201);
        return {
          entries: result.inserted,
          billingReason: result.reason,
          warning: result.warning,
        };
      } catch (err) {
        if (err instanceof ResolveError) {
          // 422 for business-rule rejections (no contract, block exhausted, expired, etc.)
          reply.code(422);
          return { error: err.code, message: err.message };
        }
        throw err;
      }
    },
  );

  // Update time entry — locked once invoiced.
  fastify.patch(
    '/api/v1/time-entries/:entryId',
    { preHandler: [fastify.authenticate, requirePermission('time-entries:write')] },
    async (request, reply) => {
      const { entryId } = request.params as { entryId: string };
      const body = request.body as Partial<{
        durationMinutes: number;
        notes: string;
        contractLineItemId: string;
        classification: 'covered' | 'billable' | 'overage' | 'internal';
        internalCategory: string;
        nonBillableReason: string | null;
      }>;

      const [existing] = await fastify.db
        .select()
        .from(ticketTimeEntries)
        .where(and(eq(ticketTimeEntries.id, entryId), eq(ticketTimeEntries.tenantId, request.tenantId)))
        .limit(1);

      if (!existing) {
        reply.code(404);
        return { error: 'not_found' };
      }
      if (existing.isBilled) {
        reply.code(409);
        return {
          error: 'entry_locked',
          message: 'This entry is already billed. Use void & re-log instead of editing.',
        };
      }

      // For now: notes-only edit goes through; structural edits (duration, classification,
      // line item) re-run the resolver in a transaction so cost/billable stay snapshotted
      // and block balance stays consistent.
      const isStructural =
        body.durationMinutes != null ||
        body.contractLineItemId != null ||
        body.classification != null ||
        body.nonBillableReason !== undefined;

      if (!isStructural) {
        const [updated] = await fastify.db
          .update(ticketTimeEntries)
          .set({ notes: body.notes, updatedAt: new Date() })
          .where(eq(ticketTimeEntries.id, entryId))
          .returning();
        return updated;
      }

      try {
        const updated = await fastify.db.transaction(async (tx) => {
          const newDuration = body.durationMinutes ?? existing.durationMinutes ?? 0;
          // Reverse old consumption by deleting the row, then re-resolve.
          await tx.delete(ticketTimeEntries).where(eq(ticketTimeEntries.id, entryId));

          const resolved = await resolveTimeEntry(tx as any, {
            tenantId: request.tenantId,
            ticketId: existing.ticketId,
            userId: existing.userId,
            durationMinutes: newDuration,
            contractLineItemId: body.contractLineItemId ?? existing.contractLineItemId ?? undefined,
            classification: body.classification ?? (existing.classification as any),
            internalCategory: (body.internalCategory ?? existing.internalCategory) as any,
            nonBillableReason:
              body.nonBillableReason === null
                ? undefined
                : ((body.nonBillableReason ?? existing.nonBillableReason) as any),
          });

          const inserts = resolved.entries.map((re, idx) => {
            const offsetMinutes = resolved.entries
              .slice(0, idx)
              .reduce((sum, e) => sum + e.durationMinutes, 0);
            const partStarted = new Date(existing.startedAt.getTime() + offsetMinutes * 60000);
            return {
              tenantId: request.tenantId,
              ticketId: existing.ticketId,
              userId: existing.userId,
              startedAt: partStarted,
              endedAt: existing.endedAt
                ? new Date(partStarted.getTime() + re.durationMinutes * 60000)
                : undefined,
              durationMinutes: re.durationMinutes,
              contractId: re.contractId,
              contractLineItemId: re.contractLineItemId,
              classification: re.classification,
              internalCategory: re.internalCategory,
              nonBillableReason: re.nonBillableReason,
              costRateCents: re.costRateCents,
              billRateCents: re.billRateCents,
              costCents: re.costCents,
              billableCents: re.billableCents,
              isBillable: re.isBillable,
              rateCents: re.rateCents,
              notes: body.notes ?? existing.notes,
            };
          });

          const rows = await tx.insert(ticketTimeEntries).values(inserts).returning();
          for (const row of rows) {
            await logAudit(tx as any, {
              tenantId: request.tenantId,
              actorType: 'user',
              actorId: request.user.sub,
              action: 'time_entry.updated',
              entityType: 'time_entry',
              entityId: row.id,
              changes: {
                classification: { old: existing.classification, new: row.classification },
                contractLineItemId: { old: existing.contractLineItemId, new: row.contractLineItemId },
                durationMinutes: { old: existing.durationMinutes, new: row.durationMinutes },
                billableCents: { old: existing.billableCents, new: row.billableCents },
                nonBillableReason: { old: existing.nonBillableReason, new: row.nonBillableReason },
              },
              ipAddress: request.ip,
            });
          }
          return rows;
        });
        return updated;
      } catch (err) {
        if (err instanceof ResolveError) {
          reply.code(422);
          return { error: err.code, message: err.message };
        }
        throw err;
      }
    },
  );

  // Bulk re-attribute time entries. Used for fix-up flows: "the week of entries
  // that went against the wrong contract." Server re-resolves each entry so
  // block balances and snapshot rates stay correct, and each change is audit-logged.
  fastify.post(
    '/api/v1/time-entries/bulk-reassign',
    { preHandler: [fastify.authenticate, requirePermission('time-entries:write')] },
    async (request, reply) => {
      const body = request.body as { entryIds?: string[]; target?: string };
      const entryIds = Array.isArray(body.entryIds) ? body.entryIds : [];
      const target = typeof body.target === 'string' ? body.target : '';
      if (entryIds.length === 0 || !target) {
        reply.code(400);
        return { error: 'invalid_input', message: 'entryIds (non-empty array) and target are required' };
      }

      const isInternal = target.startsWith('internal:');
      const internalCategory = isInternal ? target.slice('internal:'.length) : null;
      const contractLineItemId = isInternal ? undefined : target;

      const results: Array<{ entryId: string; ok: boolean; error?: string; newIds?: string[] }> = [];

      for (const entryId of entryIds) {
        try {
          const out = await fastify.db.transaction(async (tx) => {
            const [existing] = await tx
              .select()
              .from(ticketTimeEntries)
              .where(
                and(
                  eq(ticketTimeEntries.id, entryId),
                  eq(ticketTimeEntries.tenantId, request.tenantId),
                ),
              )
              .limit(1);
            if (!existing) return { ok: false, error: 'not_found' };
            if (existing.isBilled) return { ok: false, error: 'entry_locked' };

            await tx.delete(ticketTimeEntries).where(eq(ticketTimeEntries.id, entryId));

            const resolved = await resolveTimeEntry(tx as any, {
              tenantId: request.tenantId,
              ticketId: existing.ticketId,
              userId: existing.userId,
              durationMinutes: existing.durationMinutes ?? 0,
              contractLineItemId,
              classification: isInternal ? 'internal' : undefined,
              internalCategory: internalCategory as any,
              nonBillableReason: (existing.nonBillableReason ?? undefined) as any,
            });

            const inserts = resolved.entries.map((re, idx) => {
              const offsetMinutes = resolved.entries
                .slice(0, idx)
                .reduce((sum, e) => sum + e.durationMinutes, 0);
              const partStarted = new Date(existing.startedAt.getTime() + offsetMinutes * 60000);
              return {
                tenantId: request.tenantId,
                ticketId: existing.ticketId,
                userId: existing.userId,
                startedAt: partStarted,
                endedAt: existing.endedAt
                  ? new Date(partStarted.getTime() + re.durationMinutes * 60000)
                  : undefined,
                durationMinutes: re.durationMinutes,
                contractId: re.contractId,
                contractLineItemId: re.contractLineItemId,
                classification: re.classification,
                internalCategory: re.internalCategory,
                nonBillableReason: re.nonBillableReason,
                costRateCents: re.costRateCents,
                billRateCents: re.billRateCents,
                costCents: re.costCents,
                billableCents: re.billableCents,
                isBillable: re.isBillable,
                rateCents: re.rateCents,
                notes: existing.notes,
              };
            });
            const rows = await tx.insert(ticketTimeEntries).values(inserts).returning();
            for (const row of rows) {
              await logAudit(tx as any, {
                tenantId: request.tenantId,
                actorType: 'user',
                actorId: request.user.sub,
                action: 'time_entry.reassigned',
                entityType: 'time_entry',
                entityId: row.id,
                changes: {
                  contractLineItemId: { old: existing.contractLineItemId, new: row.contractLineItemId },
                  classification: { old: existing.classification, new: row.classification },
                  originalEntryId: { old: null, new: existing.id },
                },
                ipAddress: request.ip,
              });
            }
            return { ok: true, newIds: rows.map((r) => r.id) };
          });
          results.push({ entryId, ...out });
        } catch (err) {
          const code = err instanceof ResolveError ? err.code : 'error';
          const message = err instanceof Error ? err.message : 'failed';
          results.push({ entryId, ok: false, error: `${code}: ${message}` });
        }
      }

      const okCount = results.filter((r) => r.ok).length;
      reply.code(okCount === entryIds.length ? 200 : 207);
      return { results, ok: okCount, failed: entryIds.length - okCount };
    },
  );

  // Delete time entry — locked once invoiced.
  fastify.delete(
    '/api/v1/time-entries/:entryId',
    { preHandler: [fastify.authenticate, requirePermission('time-entries:write')] },
    async (request, reply) => {
      const { entryId } = request.params as { entryId: string };
      const [existing] = await fastify.db
        .select({ isBilled: ticketTimeEntries.isBilled })
        .from(ticketTimeEntries)
        .where(and(eq(ticketTimeEntries.id, entryId), eq(ticketTimeEntries.tenantId, request.tenantId)))
        .limit(1);
      if (!existing) {
        reply.code(404);
        return { error: 'not_found' };
      }
      if (existing.isBilled) {
        reply.code(409);
        return { error: 'entry_locked', message: 'This entry is already billed.' };
      }
      await fastify.db
        .delete(ticketTimeEntries)
        .where(and(eq(ticketTimeEntries.id, entryId), eq(ticketTimeEntries.tenantId, request.tenantId)));
      await logAudit(fastify.db, {
        tenantId: request.tenantId,
        actorType: 'user',
        actorId: request.user.sub,
        action: 'time_entry.deleted',
        entityType: 'time_entry',
        entityId: entryId,
        ipAddress: request.ip,
      });
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
}
