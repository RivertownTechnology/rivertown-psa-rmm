import { and, eq, sql, desc } from 'drizzle-orm';
import { connectConversations as conversations, connectIdentities as identities, connectOperations as operations,
  contacts, customers, tickets, ticketComments, type DbExecutor, type Database, type connectCredentials } from '@rivertown/db';
import type { z } from 'zod';
import { ConflictError, NotFoundError } from '../../../common/errors.js';
import { logAudit } from '../../../common/audit.js';
import { createTicketRecord } from '../../../services/ticket-create.js';
import { contextSchema, intakeSchema, eventSchema, payloadHash } from './validation.js';

export type Credential = typeof connectCredentials.$inferSelect;
type Context = z.infer<typeof contextSchema>;
type Intake = z.infer<typeof intakeSchema>;

export async function resolveConversation(db: DbExecutor, credential: Credential, body: Context) {
  await db.insert(identities).values({ tenantId: credential.tenantId, appleBusinessId: credential.appleBusinessId, appleCustomerId: body.appleCustomerId }).onConflictDoNothing();
  const [identity] = await db.select().from(identities).where(and(eq(identities.tenantId, credential.tenantId), eq(identities.appleBusinessId, credential.appleBusinessId), eq(identities.appleCustomerId, body.appleCustomerId))).limit(1);
  await db.insert(conversations).values({ tenantId: credential.tenantId, identityId: identity.id, instanceArn: credential.instanceArn, contactId: body.contactId }).onConflictDoNothing();
  const [conversation] = await db.select().from(conversations).where(and(eq(conversations.tenantId, credential.tenantId), eq(conversations.instanceArn, credential.instanceArn), eq(conversations.contactId, body.contactId))).for('update');
  if (conversation.identityId !== identity.id) throw new ConflictError('Contact is already associated with another Apple identity');
  return { conversation, identity };
}

export async function verifiedContact(db: DbExecutor, identityId: string, tenantId: string) {
  // Lock mapping through ticket creation; concurrent staff revocation cannot race it.
  const [identity] = await db.select().from(identities).where(and(eq(identities.id, identityId), eq(identities.tenantId, tenantId))).for('update');
  if (!identity?.contactId || !identity.verifiedAt) return undefined;
  const [contact] = await db.select({ id: contacts.id, customerId: contacts.customerId }).from(contacts)
    .innerJoin(customers, and(eq(customers.id, contacts.customerId), eq(customers.tenantId, tenantId)))
    .where(and(eq(contacts.id, identity.contactId), eq(contacts.tenantId, tenantId))).limit(1);
  return contact;
}

async function makeTicket(db: DbExecutor, body: Intake, identityId: string, actor: { tenantId: string; type: string; id: string; ip?: string }) {
  const contact = await verifiedContact(db, identityId, actor.tenantId);
  if (!contact) return undefined;
  const detail = [body.description, body.name && `Reported name: ${body.name}`, body.company && `Reported company: ${body.company}`,
    body.email && `Reported email (not identity proof): ${body.email}`, body.device && `Device: ${body.device}`, body.impact && `Impact: ${body.impact}`].filter(Boolean).join('\n\n');
  return createTicketRecord(db, { customerId: contact.customerId, contactId: contact.id, subject: body.subject,
    description: detail, priority: body.priority, source: 'apple_messages', ticketType: 'incident' }, actor);
}

export async function getContext(db: Database, credential: Credential, body: Context) {
  return db.transaction(async tx => {
    const { conversation } = await resolveConversation(tx, credential, body);
    const contact = await verifiedContact(tx, conversation.identityId, credential.tenantId);
    return { conversationId: conversation.id, verification: contact ? 'verified' : 'unverified', state: conversation.state };
  });
}

export async function saveIntake(db: Database, credential: Credential, body: Intake, ip?: string) {
  return db.transaction(async tx => {
    const { conversation } = await resolveConversation(tx, credential, body);
    const hash = payloadHash(body);
    const [existing] = await tx.select().from(operations).where(and(eq(operations.conversationId, conversation.id), eq(operations.kind, 'intake'), eq(operations.requestId, body.requestId))).limit(1);
    if (existing) {
      if (existing.payloadHash !== hash) throw new ConflictError('requestId was already used with different content');
      return { response: existing.response };
    }
    const ticket = await makeTicket(tx, body, conversation.identityId, { tenantId: credential.tenantId, type: 'integration', id: credential.id, ip });
    const response = { result: ticket ? 'ticket_created' : 'intake_saved', conversationId: conversation.id,
      ...(ticket ? { ticketId: ticket.id, ticketNumber: String(ticket.ticketNumber) } : {}) };
    const [operation] = await tx.insert(operations).values({ tenantId: credential.tenantId, conversationId: conversation.id, kind: 'intake', requestId: body.requestId, payloadHash: hash, payload: body, response, ticketId: ticket?.id }).returning();
    const saved = { ...response, intakeId: operation.id };
    await tx.update(operations).set({ response: saved }).where(eq(operations.id, operation.id));
    await logAudit(tx, { tenantId: credential.tenantId, actorType: 'integration', actorId: credential.id, action: 'connect.intake.saved', entityType: 'connect_intake', entityId: operation.id, ipAddress: ip });
    return { response: saved, ticket };
  });
}

export async function saveEvent(db: Database, credential: Credential, body: z.infer<typeof eventSchema>) {
  return db.transaction(async tx => {
    const { conversation } = await resolveConversation(tx, credential, body);
    const hash = payloadHash(body);
    const [existing] = await tx.select().from(operations).where(and(eq(operations.conversationId, conversation.id), eq(operations.kind, 'event'), eq(operations.requestId, body.requestId))).limit(1);
    if (existing) {
      if (existing.payloadHash !== hash) throw new ConflictError('requestId was already used with different content');
      return existing.response;
    }
    let ticketId: string | undefined;
    if (body.intakeRequestId) {
      const [intake] = await tx.select().from(operations).where(and(eq(operations.conversationId, conversation.id), eq(operations.kind, 'intake'), eq(operations.requestId, body.intakeRequestId))).limit(1);
      // Return a retryable conflict; never silently discard an event that beat its intake.
      if (!intake) throw new ConflictError('Intake not received yet; retry after intake is saved');
      ticketId = intake.ticketId ?? undefined;
      if (ticketId) {
        const contact = await verifiedContact(tx, conversation.identityId, credential.tenantId);
        const [ticket] = await tx.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, credential.tenantId), eq(tickets.customerId, contact?.customerId ?? '00000000-0000-0000-0000-000000000000'))).limit(1);
        if (!ticket) throw new ConflictError('Ticket association requires staff review');
        await tx.insert(ticketComments).values({ tenantId: credential.tenantId, ticketId, authorType: 'integration', authorId: credential.id,
          body: `[Apple Messages / ${body.sender} / ${body.occurredAt}]\n${body.text}`, isInternal: true });
      }
    }
    if (body.type === 'handoff') {
      const at = new Date(body.occurredAt);
      if (!conversation.stateAt || at > conversation.stateAt) await tx.update(conversations).set({ state: body.state, stateAt: at }).where(eq(conversations.id, conversation.id));
    }
    const response = { result: 'event_saved', conversationId: conversation.id };
    await tx.insert(operations).values({ tenantId: credential.tenantId, conversationId: conversation.id, kind: 'event', requestId: body.requestId, payloadHash: hash, payload: body, response, ticketId });
    return response;
  });
}

export async function convertIntake(db: Database, tenantId: string, id: string, userId: string, ip?: string) {
  return db.transaction(async tx => {
    const [found] = await tx.select().from(operations).where(and(eq(operations.id, id), eq(operations.tenantId, tenantId), eq(operations.kind, 'intake'))).limit(1);
    if (!found) throw new NotFoundError('Intake');
    // Same lock order as inbound operations: conversation -> identity.
    const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.id, found.conversationId), eq(conversations.tenantId, tenantId))).for('update');
    const [intake] = await tx.select().from(operations).where(eq(operations.id, found.id)).limit(1);
    if (intake.ticketId) return { response: intake.response };
    const ticket = await makeTicket(tx, intakeSchema.parse(intake.payload), conversation.identityId, { tenantId, type: 'user', id: userId, ip });
    if (!ticket) throw new ConflictError('Verify the conversation identity against a PSA contact first');
    const response = { result: 'ticket_created', conversationId: conversation.id, intakeId: intake.id, ticketId: ticket.id, ticketNumber: String(ticket.ticketNumber) };
    await tx.update(operations).set({ ticketId: ticket.id, response }).where(eq(operations.id, intake.id));
    // Preserve messages received while the intake was unverified.
    const events = await tx.select().from(operations).where(and(eq(operations.conversationId, conversation.id), eq(operations.kind, 'event'), sql`${operations.payload}->>'intakeRequestId' = ${intake.requestId}`)).orderBy(desc(operations.createdAt));
    for (const event of events) {
      await tx.insert(ticketComments).values({ tenantId, ticketId: ticket.id, authorType: 'system', authorId: userId,
        body: `[Apple Messages / ${event.payload.sender} / ${event.payload.occurredAt}]\n${event.payload.text}`, isInternal: true });
      await tx.update(operations).set({ ticketId: ticket.id }).where(eq(operations.id, event.id));
    }
    return { response, ticket };
  });
}
