import { broadcastToTenant } from '../ws/broadcast.js';
import { and, eq } from 'drizzle-orm';
import { tickets, customers, contracts, contacts, ticketAssignees, type Database, type DbExecutor } from '@rivertown/db';
import { createTicketSchema } from '@rivertown/shared';
import type { z } from 'zod';
import { NotFoundError } from '../common/errors.js';
import { getNextTicketNumber } from '../common/ticket-number.js';
import { logAudit } from '../common/audit.js';
import { moduleEvents } from '../modules/registry.js';

export type TicketActor = { tenantId: string; type: string; id: string; ip?: string };
export async function createTicketRecord(db: DbExecutor, body: z.infer<typeof createTicketSchema>, actor: TicketActor) {
  if (body.contactId) {
    const [contact] = await db.select({ id: contacts.id }).from(contacts).where(and(
      eq(contacts.id, body.contactId), eq(contacts.tenantId, actor.tenantId), eq(contacts.customerId, body.customerId),
    )).limit(1);
    if (!contact) throw new NotFoundError('Contact', body.contactId);
  }
  // Validate referenced records belong to the caller's tenant before insert
  const [customer] = await db.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.id, body.customerId), eq(customers.tenantId, actor.tenantId))).limit(1);
  if (!customer) throw new NotFoundError('Customer', body.customerId);
  if (body.contractId) {
    const [contract] = await db.select({ id: contracts.id }).from(contracts)
      .where(and(eq(contracts.id, body.contractId), eq(contracts.tenantId, actor.tenantId))).limit(1);
    if (!contract) throw new NotFoundError('Contract', body.contractId);
  }

  const ticketNumber = await getNextTicketNumber(db, actor.tenantId);

  const [ticket] = await db
    .insert(tickets)
    .values({
      tenantId: actor.tenantId,
      ticketNumber,
      customerId: body.customerId,
      contactId: body.contactId,
      assetId: body.assetId,
      contractId: body.contractId,
      categoryId: body.categoryId,
      subcategoryId: body.subcategoryId,
      subject: body.subject,
      description: body.description,
      priority: body.priority,
      ticketType: body.ticketType,
      source: body.source,
    })
    .returning();

  // Assignment is a set. `assignedTo` is still accepted as a deprecated
  // single-value alias so a cached pre-multi-assign client keeps working.
  const assigneeIds = Array.from(new Set([
    ...(body.assigneeIds ?? []),
    ...(body.assignedTo ? [body.assignedTo] : []),
  ]));
  if (assigneeIds.length > 0) {
    await db.insert(ticketAssignees).values(
      assigneeIds.map(userId => ({
        tenantId: actor.tenantId,
        ticketId: ticket.id,
        userId,
        assignedBy: actor.type === 'user' ? actor.id : null,
      })),
    ).onConflictDoNothing();
  }
  Object.assign(ticket, { assigneeIds });

  // Calculate and apply SLA
  const { calculateSla } = await import('./sla-calculator.js');
  const sla = await calculateSla(db, actor.tenantId, body.customerId, body.priority ?? 'medium', new Date());
  if (sla.slaPolicyId) {
    await db.update(tickets).set({
      slaDueAt: sla.slaDueAt,
      slaResponseDueAt: sla.slaResponseDueAt,
      slaResolutionDueAt: sla.slaResolutionDueAt,
      slaPolicyId: sla.slaPolicyId,
    }).where(eq(tickets.id, ticket.id));
    // Update the returned ticket object
    Object.assign(ticket, { slaDueAt: sla.slaDueAt, slaResponseDueAt: sla.slaResponseDueAt, slaResolutionDueAt: sla.slaResolutionDueAt, slaPolicyId: sla.slaPolicyId });
  }

  await logAudit(db, {
    tenantId: actor.tenantId,
    actorType: actor.type,
    actorId: actor.id,
    action: 'ticket.created',
    entityType: 'ticket',
    entityId: ticket.id,
    ipAddress: actor.ip,
  });

  return ticket;
}

export async function dispatchTicketCreated(db: Database, ticket: typeof tickets.$inferSelect, excludeUserId?: string) {
  moduleEvents.emit('ticket.created', ticket);
  broadcastToTenant(ticket.tenantId, { type: 'ticket.created', ticketId: ticket.id });

  // Evaluate workflow rules for new ticket
  import('./workflow-engine.js').then(({ evaluateWorkflowRules }) => {
    evaluateWorkflowRules(db, ticket.tenantId, 'ticket_created', ticket).catch(e => console.error('Workflow error:', e));
  });

  // Send ticket created email notification (fire and forget)
  import('./email-notifications.js').then(({ sendTicketCreatedEmail }) => {
    sendTicketCreatedEmail(db, ticket.tenantId, ticket.id).catch(e => console.error('Ticket created email failed:', e));
  });

  // Notify all techs/admins/owners about the new ticket, excluding whoever created it
  import('./notifications.js').then(({ notifyTenantStaff }) => {
    notifyTenantStaff(db, {
      tenantId: ticket.tenantId,
      type: 'ticket_created',
      title: `New ticket #${ticket.ticketNumber}`,
      body: ticket.subject,
      entityType: 'ticket',
      entityId: ticket.id,
      excludeUserId: excludeUserId,
    }).catch(() => {});
  });

}
