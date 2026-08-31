import { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { agreements, documentSignatures, tenants } from '@rivertown/db';
import { sendQuoteSchema, publicSignSchema, publicDeclineSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { logAudit } from '../../common/audit.js';

export async function agreementRoutes(fastify: FastifyInstance) {
  // List agreements (filter by customerId / quoteId / status)
  fastify.get('/api/v1/agreements', { preHandler: [fastify.authenticate, requirePermission('quotes:read')] }, async (request) => {
    const params = request.query as Record<string, string>;
    const conditions = [eq(agreements.tenantId, request.tenantId)];
    if (params.customerId) conditions.push(eq(agreements.customerId, params.customerId));
    if (params.quoteId) conditions.push(eq(agreements.quoteId, params.quoteId));
    if (params.status) conditions.push(eq(agreements.status, params.status));
    return fastify.db.select().from(agreements)
      .where(and(...conditions)).orderBy(desc(agreements.createdAt)).limit(100);
  });

  // Get agreement with latest signature
  fastify.get('/api/v1/agreements/:id', { preHandler: [fastify.authenticate, requirePermission('quotes:read')] }, async (request) => {
    const { id } = request.params as { id: string };
    const [agreement] = await fastify.db.select().from(agreements)
      .where(and(eq(agreements.id, id), eq(agreements.tenantId, request.tenantId))).limit(1);
    if (!agreement) throw new NotFoundError('Agreement', id);
    const [signature] = await fastify.db.select().from(documentSignatures)
      .where(and(
        eq(documentSignatures.tenantId, request.tenantId),
        eq(documentSignatures.entityType, 'msa'),
        eq(documentSignatures.entityId, id),
      )).orderBy(desc(documentSignatures.createdAt)).limit(1);
    return { ...agreement, signature: signature ?? null };
  });

  // Resend the signing link
  fastify.post('/api/v1/agreements/:id/resend', { preHandler: [fastify.authenticate, requirePermission('quotes:write')] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { to } = sendQuoteSchema.parse(request.body);
    const [agreement] = await fastify.db.select().from(agreements)
      .where(and(eq(agreements.id, id), eq(agreements.tenantId, request.tenantId))).limit(1);
    if (!agreement) throw new NotFoundError('Agreement', id);
    if (agreement.status === 'signed') {
      reply.code(409).send({ error: 'INVALID_STATUS', message: 'This agreement is already signed.' });
      return;
    }

    const { resendAgreement } = await import('../../services/quote-signing.js');
    try {
      await resendAgreement(fastify.db, request.tenantId, id, to);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Agreement email failed';
      request.log.error({ err }, `[AGREEMENTS] Resend failed for agreement ${id}`);
      reply.code(502).send({ error: 'SEND_FAILED', message });
      return;
    }

    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: request.user.sub,
      action: 'agreement.resent', entityType: 'agreement', entityId: id, ipAddress: request.ip,
      changes: { recipient: { old: null, new: to } },
    });
    return { success: true };
  });

  // ── Public agreement signing (no auth; opaque token) ─────────────

  const publicRateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } } as any;

  async function loadAgreementSignatureContext(db: any, token: string) {
    if (!token || token.length < 10) return null;
    const [sig] = await db.select().from(documentSignatures)
      .where(and(eq(documentSignatures.token, token), eq(documentSignatures.entityType, 'msa')))
      .limit(1);
    if (!sig) return null;
    const [agreement] = await db.select().from(agreements)
      .where(and(eq(agreements.id, sig.entityId), eq(agreements.tenantId, sig.tenantId))).limit(1);
    if (!agreement) return null;
    return { sig, agreement };
  }

  fastify.get('/api/public/sign/agreement/:token', { config: publicRateLimit }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const ctx = await loadAgreementSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const { sig, agreement } = ctx;

    const { generateSignPage } = await import('../../services/template-renderer.js');
    const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, sig.tenantId)).limit(1);
    const businessName = ((tenant?.settings as Record<string, string>)?.businessName) || tenant?.name || 'Rivertown Technology';

    let state: 'active' | 'signed' | 'declined' | 'expired' | 'revoked' = 'active';
    if (sig.status === 'revoked') state = 'revoked';
    else if (sig.status === 'declined' || agreement.status === 'declined') state = 'declined';
    else if (sig.status === 'signed' || agreement.status === 'signed') state = 'signed';
    else if (sig.expiresAt && new Date(sig.expiresAt) < new Date()) state = 'expired';

    if (state === 'active' && sig.status === 'pending') {
      const now = new Date();
      await fastify.db.update(documentSignatures).set({ status: 'viewed', viewedAt: now, updatedAt: now })
        .where(eq(documentSignatures.id, sig.id));
      if (agreement.status === 'sent') {
        await fastify.db.update(agreements).set({ status: 'viewed', updatedAt: now })
          .where(eq(agreements.id, agreement.id));
      }
      await logAudit(fastify.db, {
        tenantId: sig.tenantId, actorType: 'public_signer', actorId: sig.id,
        action: 'agreement.viewed', entityType: 'agreement', entityId: agreement.id, ipAddress: request.ip,
      });
    }

    const docHtml = `<div style="padding:40px;font-family:Georgia,'Times New Roman',serif;line-height:1.6">${agreement.contentHtml}</div>`;
    const base = `${process.env.API_BASE_URL || 'https://rivertownapi-production.up.railway.app'}/api/public/sign/agreement/${token}`;
    const html = generateSignPage({
      state,
      docLabel: agreement.title,
      docHtml,
      businessName,
      signEndpoint: base,
      declineEndpoint: `${base}/decline`,
      signedName: sig.signerName ?? undefined,
      successMessage: 'Your agreement has been signed. A copy will be emailed to you for your records — welcome aboard!',
    });
    reply.type('text/html').send(html);
  });

  fastify.post('/api/public/sign/agreement/:token', { config: publicRateLimit }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = publicSignSchema.parse(request.body);
    const ctx = await loadAgreementSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const { sig, agreement } = ctx;

    if (!['pending', 'viewed'].includes(sig.status) || !['sent', 'viewed'].includes(agreement.status)) {
      return reply.code(409).send({ error: 'INVALID_STATUS', message: 'This agreement can no longer be signed from this link.' });
    }
    if (sig.expiresAt && new Date(sig.expiresAt) < new Date()) {
      return reply.code(410).send({ error: 'EXPIRED', message: 'This link has expired. Please request a new one.' });
    }

    const { completeMsaSignature } = await import('../../services/quote-signing.js');
    await completeMsaSignature(fastify.db, sig.tenantId, agreement, sig.id, {
      signerName: body.signerName,
      signerEmail: body.signerEmail,
      ip: request.ip,
      forwardedFor: (request.headers['x-forwarded-for'] as string) ?? undefined,
      userAgent: (request.headers['user-agent'] as string) ?? undefined,
    }, sig.recipientEmail);

    return { success: true };
  });

  fastify.post('/api/public/sign/agreement/:token/decline', { config: publicRateLimit }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = publicDeclineSchema.parse(request.body ?? {});
    const ctx = await loadAgreementSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const { sig, agreement } = ctx;

    if (!['pending', 'viewed'].includes(sig.status) || !['sent', 'viewed'].includes(agreement.status)) {
      return reply.code(409).send({ error: 'INVALID_STATUS', message: 'This agreement can no longer be declined from this link.' });
    }

    const now = new Date();
    await fastify.db.transaction(async (tx) => {
      await tx.update(documentSignatures).set({
        status: 'declined', declinedAt: now, declineReason: body.reason ?? null,
        ipAddress: request.ip,
        forwardedFor: (request.headers['x-forwarded-for'] as string) ?? null,
        userAgent: (request.headers['user-agent'] as string) ?? null,
        updatedAt: now,
      }).where(eq(documentSignatures.id, sig.id));
      await tx.update(agreements).set({ status: 'declined', updatedAt: now })
        .where(eq(agreements.id, agreement.id));
    });

    await logAudit(fastify.db, {
      tenantId: sig.tenantId, actorType: 'public_signer', actorId: sig.id,
      action: 'agreement.declined', entityType: 'agreement', entityId: agreement.id, ipAddress: request.ip,
    });

    const { notifyTenantStaff } = await import('../../services/notifications.js');
    try {
      await notifyTenantStaff(fastify.db, {
        tenantId: sig.tenantId, type: 'agreement_declined',
        title: `${agreement.title} was declined`,
        body: body.reason || undefined,
        entityType: 'agreement', entityId: agreement.id,
      });
    } catch (err) {
      request.log.error({ err }, '[AGREEMENTS] Decline notification failed');
    }

    return { success: true };
  });
}
