import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { and, eq, desc, isNull } from 'drizzle-orm';
import { z } from 'zod';
import { connectCredentials as credentials, connectConversations as conversations, connectIdentities as identities,
  connectOperations as operations, contacts, customers } from '@rivertown/db';
import { requirePermission } from '../../../auth/rbac.js';
import { UnauthorizedError, NotFoundError } from '../../../common/errors.js';
import { logAudit } from '../../../common/audit.js';
import { dispatchTicketCreated } from '../../../services/ticket-create.js';
import { contextSchema, credentialSchema, intakeSchema, eventSchema, verificationSchema, hashToken } from './validation.js';
import { getContext, saveIntake, saveEvent, convertIntake, type Credential } from './service.js';

declare module 'fastify' {
  interface FastifyContextConfig { public?: boolean; }
}

const base = '/api/v1/integrations/amazon-connect';
const idSchema = z.object({ id: z.string().uuid() });
const pageSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), offset: z.coerce.number().int().min(0).default(0) });

export async function amazonConnectRoutes(app: FastifyInstance) {
  const authenticated = new WeakMap<FastifyRequest, Credential>();
  async function authenticateMachine(request: FastifyRequest) {
    const match = /^Bearer (rtc_[A-Za-z0-9_-]{43})$/.exec(request.headers.authorization ?? '');
    if (!match) throw new UnauthorizedError();
    const [credential] = await app.db.select().from(credentials).where(and(eq(credentials.tokenHash, hashToken(match[1])), eq(credentials.enabled, true))).limit(1);
    if (!credential) throw new UnauthorizedError();
    request.tenantId = credential.tenantId;
    authenticated.set(request, credential);
    await app.db.update(credentials).set({ lastUsedAt: new Date() }).where(eq(credentials.id, credential.id));
  }
  // public only skips the *user JWT* hook. Each machine route authenticates in
  // onRequest, before parsing its body. No prefix-wide authentication exemption.
  const machine = { config: { public: true }, onRequest: authenticateMachine, bodyLimit: 65536 };
  const manage = { preHandler: [app.authenticate, requirePermission('integrations:manage')] };
  const review = { preHandler: [app.authenticate, requirePermission('tickets:write')] };

  async function dispatch(result: Awaited<ReturnType<typeof saveIntake>>, request: FastifyRequest) {
    if (result.ticket) {
      try { await dispatchTicketCreated(app.db, result.ticket); }
      catch (error) { request.log.error({ err: error, ticketId: result.ticket.id }, 'Connect ticket post-commit notification failed'); }
    }
    return result.response;
  }

  app.post(`${base}/context`, machine, async request => getContext(app.db, authenticated.get(request)!, contextSchema.parse(request.body)));
  app.post(`${base}/intake`, machine, async request => dispatch(await saveIntake(app.db, authenticated.get(request)!, intakeSchema.parse(request.body), request.ip), request));
  app.post(`${base}/events`, machine, async request => saveEvent(app.db, authenticated.get(request)!, eventSchema.parse(request.body)));

  app.post(`${base}/credentials`, manage, async (request, reply) => {
    const body = credentialSchema.parse(request.body);
    const token = `rtc_${randomBytes(32).toString('base64url')}`;
    const credential = await app.db.transaction(async tx => {
      const [row] = await tx.insert(credentials).values({ ...body, tenantId: request.tenantId, tokenHash: hashToken(token) }).returning({ id: credentials.id, name: credentials.name, createdAt: credentials.createdAt });
      await logAudit(tx, { tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub, action: 'connect.credential.created', entityType: 'connect_credential', entityId: row.id, ipAddress: request.ip });
      return row;
    });
    reply.header('Cache-Control', 'no-store').code(201);
    return { ...credential, token };
  });
  app.get(`${base}/credentials`, manage, async request => app.db.select({
    id: credentials.id, name: credentials.name, appleBusinessId: credentials.appleBusinessId, instanceArn: credentials.instanceArn,
    enabled: credentials.enabled, createdAt: credentials.createdAt, lastUsedAt: credentials.lastUsedAt,
  }).from(credentials).where(eq(credentials.tenantId, request.tenantId)).orderBy(desc(credentials.createdAt)));
  app.delete(`${base}/credentials/:id`, manage, async (request, reply) => {
    const { id } = idSchema.parse(request.params);
    await app.db.transaction(async tx => {
      const [row] = await tx.update(credentials).set({ enabled: false }).where(and(eq(credentials.id, id), eq(credentials.tenantId, request.tenantId))).returning({ id: credentials.id });
      if (!row) throw new NotFoundError('Credential');
      await logAudit(tx, { tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub, action: 'connect.credential.revoked', entityType: 'connect_credential', entityId: id, ipAddress: request.ip });
    });
    return reply.code(204).send();
  });

  app.get(`${base}/intakes`, review, async request => {
    const { limit, offset, pending } = pageSchema.extend({ pending: z.enum(['true', 'false']).default('true') }).parse(request.query);
    return app.db.select().from(operations).where(and(eq(operations.tenantId, request.tenantId), eq(operations.kind, 'intake'), pending === 'true' ? isNull(operations.ticketId) : undefined)).orderBy(desc(operations.createdAt)).limit(limit).offset(offset);
  });
  app.get(`${base}/conversations/:id/events`, review, async request => {
    const { id } = idSchema.parse(request.params);
    const { limit, offset } = pageSchema.parse(request.query);
    const [conversation] = await app.db.select({ id: conversations.id }).from(conversations).where(and(eq(conversations.id, id), eq(conversations.tenantId, request.tenantId))).limit(1);
    if (!conversation) throw new NotFoundError('Conversation');
    return app.db.select().from(operations).where(and(eq(operations.tenantId, request.tenantId), eq(operations.conversationId, id), eq(operations.kind, 'event'))).orderBy(desc(operations.createdAt)).limit(limit).offset(offset);
  });
  app.post(`${base}/conversations/:id/verification`, review, async request => {
    const { id } = idSchema.parse(request.params);
    const body = verificationSchema.parse(request.body);
    return app.db.transaction(async tx => {
      const [conversation] = await tx.select().from(conversations).where(and(eq(conversations.id, id), eq(conversations.tenantId, request.tenantId))).for('update');
      if (!conversation) throw new NotFoundError('Conversation');
      if (body.contactId) {
        const [contact] = await tx.select({ id: contacts.id }).from(contacts).innerJoin(customers, and(eq(customers.id, contacts.customerId), eq(customers.tenantId, request.tenantId)))
          .where(and(eq(contacts.id, body.contactId), eq(contacts.tenantId, request.tenantId))).limit(1);
        if (!contact) throw new NotFoundError('Contact');
      }
      await tx.update(identities).set({ contactId: body.contactId, verifiedBy: request.user.sub, verificationNote: body.note,
        verifiedAt: body.contactId ? new Date() : null }).where(and(eq(identities.id, conversation.identityId), eq(identities.tenantId, request.tenantId)));
      await logAudit(tx, { tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub, action: body.contactId ? 'connect.identity.verified' : 'connect.identity.revoked', entityType: 'connect_identity', entityId: conversation.identityId, ipAddress: request.ip });
      return { conversationId: id, verification: body.contactId ? 'verified' : 'unverified' };
    });
  });
  app.post(`${base}/intakes/:id/convert`, review, async request => {
    const { id } = idSchema.parse(request.params);
    return dispatch(await convertIntake(app.db, request.tenantId, id, request.user.sub, request.ip), request);
  });
}
