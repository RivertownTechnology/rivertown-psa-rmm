import { FastifyInstance } from 'fastify';
import { eq, and, desc } from 'drizzle-orm';
import { agreements, documentSignatures, signatureDocuments, tenants } from '@rivertown/db';
import { sendQuoteSchema, publicSignSchema, publicDeclineSchema } from '@rivertown/shared';
import { requirePermission } from '../../auth/rbac.js';
import { NotFoundError } from '../../common/errors.js';
import { logAudit } from '../../common/audit.js';
import { clientIp } from '../../common/client-ip.js';

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
    let hasIdDocument = false;
    if (signature) {
      const [doc] = await fastify.db.select({ id: signatureDocuments.id }).from(signatureDocuments)
        .where(eq(signatureDocuments.signatureId, signature.id)).limit(1);
      hasIdDocument = Boolean(doc);
    }
    return { ...agreement, signature: signature ?? null, hasIdDocument };
  });

  // Photo ID captured during signing — staff view (preview-token gated so the
  // browser can open it directly). Views are audit-logged.
  fastify.get('/api/v1/agreements/:id/id-document', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const token = (request.query as Record<string, string>).token;
    const { id } = request.params as { id: string };
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }
    let viewerSub = '';
    try {
      const payload = fastify.jwt.verify<{ sub: string; tid: string; type: string; resource?: string }>(token);
      if (payload.type !== 'preview' || payload.resource !== `agreement:${id}`) { reply.code(401).send({ error: 'Invalid token' }); return; }
      (request as any).tenantId = payload.tid;
      viewerSub = payload.sub;
    } catch { reply.code(401).send({ error: 'Invalid or expired token' }); return; }

    const [sig] = await fastify.db.select().from(documentSignatures)
      .where(and(
        eq(documentSignatures.tenantId, request.tenantId),
        eq(documentSignatures.entityType, 'msa'),
        eq(documentSignatures.entityId, id),
      )).orderBy(desc(documentSignatures.createdAt)).limit(1);
    if (!sig) return reply.code(404).send({ error: 'Not found' });

    const [doc] = await fastify.db.select().from(signatureDocuments)
      .where(eq(signatureDocuments.signatureId, sig.id))
      .orderBy(desc(signatureDocuments.createdAt)).limit(1);
    if (!doc) return reply.code(404).send({ error: 'Not found' });

    await logAudit(fastify.db, {
      tenantId: request.tenantId, actorType: 'user', actorId: viewerSub,
      action: 'agreement.id_document_viewed', entityType: 'agreement', entityId: id, ipAddress: request.ip,
    });

    reply
      .type(doc.mimeType)
      .header('Content-Disposition', `inline; filename="${doc.fileName.replace(/[^\w .-]/g, '')}"`)
      .header('Cache-Control', 'no-store')
      .send(Buffer.from(doc.dataBase64, 'base64'));
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

  // Short-lived preview token so the browser can open the PDF directly
  fastify.post('/api/v1/agreements/:id/preview-token', {
    preHandler: [fastify.authenticate, requirePermission('quotes:read')],
  }, async (request) => {
    const { id } = request.params as { id: string };
    const token = fastify.jwt.sign(
      { sub: request.user.sub, tid: request.tenantId, role: request.user.role, type: 'preview' as const, resource: `agreement:${id}` },
      { expiresIn: '60s' },
    );
    return { token };
  });

  // Agreement PDF (regenerated on demand; includes both signature blocks —
  // client typed signature + auto-applied provider countersignature — when signed)
  fastify.get('/api/v1/agreements/:id/pdf', {
    config: { public: true } as any,
  }, async (request, reply) => {
    const token = (request.query as Record<string, string>).token;
    const { id } = request.params as { id: string };
    if (!token) { reply.code(401).send({ error: 'Token required' }); return; }
    try {
      const payload = fastify.jwt.verify<{ tid: string; type: string; resource?: string }>(token);
      if (payload.type !== 'preview' || payload.resource !== `agreement:${id}`) { reply.code(401).send({ error: 'Invalid token' }); return; }
      (request as any).tenantId = payload.tid;
    } catch { reply.code(401).send({ error: 'Invalid or expired token' }); return; }

    const [agreement] = await fastify.db.select().from(agreements)
      .where(and(eq(agreements.id, id), eq(agreements.tenantId, request.tenantId))).limit(1);
    if (!agreement) throw new NotFoundError('Agreement', id);

    const [sig] = await fastify.db.select().from(documentSignatures)
      .where(and(
        eq(documentSignatures.tenantId, request.tenantId),
        eq(documentSignatures.entityType, 'msa'),
        eq(documentSignatures.entityId, id),
        eq(documentSignatures.status, 'signed'),
      )).orderBy(desc(documentSignatures.signedAt)).limit(1);

    const { buildAgreementPdf, signatureBlockFromRow } = await import('../../services/quote-signing.js');
    let sigBlock;
    if (sig) {
      const [idDoc] = await fastify.db.select({ id: signatureDocuments.id }).from(signatureDocuments)
        .where(eq(signatureDocuments.signatureId, sig.id)).limit(1);
      sigBlock = { ...signatureBlockFromRow(sig), idOnFile: Boolean(idDoc) };
    }
    const pdf = await buildAgreementPdf(fastify.db, request.tenantId, agreement, sigBlock);
    reply
      .type('application/pdf')
      .header('Content-Disposition', `inline; filename="${agreement.title.replace(/[^\w -]/g, '')}${sig ? '-Signed' : ''}.pdf"`)
      .send(pdf);
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

    // QR code that hands the ID-capture step off to a phone
    let qrDataUrl: string | undefined;
    if (state === 'active') {
      try {
        const QRCode = (await import('qrcode')).default;
        qrDataUrl = await QRCode.toDataURL(`${base}/id-capture`, { margin: 1, width: 200 });
      } catch (err) {
        request.log.error({ err }, '[AGREEMENTS] QR generation failed');
      }
    }

    const html = generateSignPage({
      state,
      docLabel: agreement.title,
      docHtml,
      businessName,
      signEndpoint: base,
      declineEndpoint: `${base}/decline`,
      signedName: sig.signerName ?? undefined,
      successMessage: 'Your agreement has been signed. A copy will be emailed to you for your records — welcome aboard!',
      idCapture: { uploadEndpoint: `${base}/id-upload`, qrDataUrl, statusEndpoint: `${base}/id-status` },
    });
    reply.type('text/html').send(html);
  });

  // Mobile ID-capture page (opened by scanning the QR on the signing page)
  fastify.get('/api/public/sign/agreement/:token/id-capture', { config: publicRateLimit }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const ctx = await loadAgreementSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const { sig, agreement } = ctx;

    if (!['pending', 'viewed'].includes(sig.status) || !['sent', 'viewed'].includes(agreement.status)) {
      return reply.type('text/html').send('<p style="font-family:sans-serif;padding:24px">This link is no longer active.</p>');
    }

    const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, sig.tenantId)).limit(1);
    const businessName = ((tenant?.settings as Record<string, string>)?.businessName) || tenant?.name || 'Rivertown Technology';
    const [doc] = await fastify.db.select({ id: signatureDocuments.id }).from(signatureDocuments)
      .where(eq(signatureDocuments.signatureId, sig.id)).limit(1);

    const { generateIdCapturePage } = await import('../../services/template-renderer.js');
    const base = `${process.env.API_BASE_URL || 'https://rivertownapi-production.up.railway.app'}/api/public/sign/agreement/${token}`;
    reply.type('text/html').send(generateIdCapturePage({
      businessName,
      docLabel: agreement.title,
      uploadEndpoint: `${base}/id-upload`,
      alreadyUploaded: Boolean(doc),
    }));
  });

  // Polled by the signing page to detect a phone-side upload (higher rate
  // limit than the other public routes: one poll every ~4s)
  fastify.get('/api/public/sign/agreement/:token/id-status', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } } as any,
  }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const ctx = await loadAgreementSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const [doc] = await fastify.db.select({ id: signatureDocuments.id }).from(signatureDocuments)
      .where(eq(signatureDocuments.signatureId, ctx.sig.id)).limit(1);
    return { uploaded: Boolean(doc) };
  });

  // Photo ID upload from the signing page (JSON base64; images are downscaled
  // client-side to ~1600px JPEG before upload)
  fastify.post('/api/public/sign/agreement/:token/id-upload', {
    config: publicRateLimit,
    bodyLimit: 12 * 1024 * 1024,
  }, async (request, reply) => {
    const { token } = request.params as { token: string };
    const body = request.body as { fileName?: string; mimeType?: string; dataBase64?: string };
    const ctx = await loadAgreementSignatureContext(fastify.db, token);
    if (!ctx) return reply.code(404).send({ error: 'Not found' });
    const { sig, agreement } = ctx;

    if (!['pending', 'viewed'].includes(sig.status) || !['sent', 'viewed'].includes(agreement.status)) {
      return reply.code(409).send({ error: 'INVALID_STATUS', message: 'This agreement can no longer be signed from this link.' });
    }
    const mimeType = body.mimeType ?? '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      return reply.code(400).send({ error: 'INVALID_TYPE', message: 'Please upload a JPEG, PNG, or WebP image.' });
    }
    const dataBase64 = (body.dataBase64 ?? '').replace(/\s/g, '');
    if (!dataBase64 || !/^[A-Za-z0-9+/=]+$/.test(dataBase64)) {
      return reply.code(400).send({ error: 'INVALID_DATA', message: 'Image data is missing or malformed.' });
    }
    const fileSize = Math.floor(dataBase64.length * 3 / 4);
    if (fileSize > 8 * 1024 * 1024) {
      return reply.code(400).send({ error: 'TOO_LARGE', message: 'Image is too large — please try again.' });
    }

    // One active ID per signature request: replace any prior upload
    await fastify.db.delete(signatureDocuments).where(eq(signatureDocuments.signatureId, sig.id));
    await fastify.db.insert(signatureDocuments).values({
      tenantId: sig.tenantId,
      signatureId: sig.id,
      docType: 'photo_id',
      fileName: (body.fileName ?? 'photo-id.jpg').replace(/[^\w .-]/g, '').slice(0, 100) || 'photo-id.jpg',
      mimeType,
      fileSize,
      dataBase64,
    });

    await logAudit(fastify.db, {
      tenantId: sig.tenantId, actorType: 'public_signer', actorId: sig.id,
      action: 'agreement.id_document_uploaded', entityType: 'agreement', entityId: agreement.id, ipAddress: clientIp(request),
    });

    return { success: true };
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

    // Photo ID must be attached before the agreement can be signed
    const [idDoc] = await fastify.db.select({ id: signatureDocuments.id }).from(signatureDocuments)
      .where(eq(signatureDocuments.signatureId, sig.id)).limit(1);
    if (!idDoc) {
      return reply.code(400).send({ error: 'ID_REQUIRED', message: 'Please attach a photo of your ID before signing.' });
    }

    const { completeMsaSignature } = await import('../../services/quote-signing.js');
    await completeMsaSignature(fastify.db, sig.tenantId, agreement, sig.id, {
      signerName: body.signerName,
      signerEmail: body.signerEmail,
      signerPhone: body.signerPhone,
      ip: clientIp(request),
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
        ipAddress: clientIp(request),
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
