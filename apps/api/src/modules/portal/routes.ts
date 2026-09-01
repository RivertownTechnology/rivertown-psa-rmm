import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { eq, and, desc, sql, count } from 'drizzle-orm';
import { compare, hash } from 'bcryptjs';
import { contacts, tickets, ticketComments, quotes, invoices, assets, agreements, payments, ticketCategories, ticketSubcategories } from '@rivertown/db';
import { ValidationError, NotFoundError, ForbiddenError } from '../../common/errors.js';
import { getNextTicketNumber } from '../../common/ticket-number.js';

type PortalUser = { sub: string; tid: string; cid: string; role: string; portalRole: string; perms: string[] };

function getPortalUser(request: { user: unknown }): PortalUser {
  return request.user as PortalUser;
}

function requirePerm(user: PortalUser, perm: string) {
  if (user.portalRole === 'admin') return; // admins have all permissions
  const perms = user.perms ?? [];
  if (!perms.includes(perm)) {
    throw new ForbiddenError(`You don't have ${perm} access. Contact your portal administrator.`);
  }
}

export async function portalRoutes(fastify: FastifyInstance) {
  // ===== AUTH =====

  fastify.post('/api/v1/portal/auth/login', { config: { public: true, rateLimit: { max: 5, timeWindow: '5 minutes' } } as any }, async (request, reply) => {
    const { email, password } = request.body as { email: string; password: string };

    const [contact] = await fastify.db.select().from(contacts)
      .where(eq(contacts.email, email.toLowerCase())).limit(1);

    if (!contact || !contact.portalEnabled || !contact.portalPasswordHash) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    const valid = await compare(password, contact.portalPasswordHash);
    if (!valid) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'Invalid credentials' });
    }

    const portalRole = (contact.portalRole as string) ?? 'user';
    const portalPerms = (contact.portalPermissions as string[]) ?? ['tickets'];

    // Check if user has passkey or MFA set up
    const { passkeyCredentials } = await import('@rivertown/db');
    const [hasPasskey] = await fastify.db.select({ id: passkeyCredentials.id })
      .from(passkeyCredentials).where(eq(passkeyCredentials.contactId, contact.id)).limit(1);

    const hasMfa = contact.portalMfaEnabled;
    const hasSecondFactor = !!hasPasskey || hasMfa;

    // If MFA is enabled, require SMS code verification before issuing tokens
    if (hasMfa && contact.portalMfaMethod === 'sms' && contact.portalMfaPhone) {
      // Issue a short-lived MFA challenge token (not a real access token)
      const mfaToken = fastify.jwt.sign(
        { jti: randomUUID(), sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', type: 'mfa_challenge' as const },
        { expiresIn: '5m' },
      );

      // Generate and send SMS code (placeholder if Twilio not configured)
      const { generateSmsCode, sendSms } = await import('../../services/sms.js');
      const { portalMfaCodes } = await import('@rivertown/db');
      const { hash: hashPw } = await import('bcryptjs');
      const code = generateSmsCode();
      const codeHash = await hashPw(code, 10);
      await fastify.db.insert(portalMfaCodes).values({
        tenantId: contact.tenantId, contactId: contact.id, codeHash,
        purpose: 'login', expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      sendSms({ to: contact.portalMfaPhone, message: `Your Rivertown Technology verification code is ${code}. Expires in 10 minutes.` }, fastify.db, contact.tenantId)
        .catch(e => console.error('[SMS] Send failed:', e));

      return reply.send({
        mfaRequired: true,
        mfaToken,
        mfaMethod: 'sms',
        phoneHint: '***-***-' + contact.portalMfaPhone.slice(-4),
      });
    }

    // No MFA — issue tokens. Increment counter if no second factor.
    let loginsWithoutMfa = contact.portalLoginsWithoutMfa;
    if (!hasSecondFactor) {
      loginsWithoutMfa = (loginsWithoutMfa ?? 0) + 1;
      await fastify.db.update(contacts).set({
        portalLoginsWithoutMfa: loginsWithoutMfa,
        updatedAt: new Date(),
      }).where(eq(contacts.id, contact.id));
    }

    const mustSetupMfa = !hasSecondFactor && loginsWithoutMfa > 3;

    const accessToken = fastify.jwt.sign(
      { jti: randomUUID(), sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', portalRole, perms: portalPerms, type: 'access' as const },
      { expiresIn: '4h' },
    );

    const refreshToken = fastify.jwt.sign(
      { jti: randomUUID(), sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', portalRole, perms: portalPerms, type: 'refresh' as const },
      { expiresIn: '7d' },
    );

    return {
      accessToken,
      refreshToken,
      user: { id: contact.id, name: `${contact.firstName} ${contact.lastName}`, email: contact.email },
      customerId: contact.customerId,
      portalRole,
      portalPermissions: portalPerms,
      mustChangePassword: contact.mustChangePassword,
      mustSetupMfa,
      loginsWithoutMfa,
      hasSecondFactor,
    };
  });

  // ===== PORTAL SMS MFA =====

  // Verify SMS code during login (exchanges mfaToken for real access tokens)
  fastify.post('/api/v1/portal/auth/mfa/verify', {
    config: { public: true, rateLimit: { max: 5, timeWindow: '5 minutes' } } as any,
  }, async (request, reply) => {
    const { mfaToken, code } = request.body as { mfaToken: string; code: string };
    if (!mfaToken || !code) throw new ValidationError('mfaToken and code are required');
    if (!/^\d{6}$/.test(code)) throw new ValidationError('Invalid code format');

    let payload: any;
    try { payload = fastify.jwt.verify(mfaToken); }
    catch { return reply.code(401).send({ error: 'Invalid or expired MFA token' }); }
    if (payload.type !== 'mfa_challenge') return reply.code(401).send({ error: 'Invalid token type' });

    const { portalMfaCodes } = await import('@rivertown/db');
    const { desc: descOrder } = await import('drizzle-orm');
    const [codeRow] = await fastify.db.select().from(portalMfaCodes)
      .where(and(
        eq(portalMfaCodes.contactId, payload.sub),
        eq(portalMfaCodes.tenantId, payload.tid),
        eq(portalMfaCodes.purpose, 'login'),
      ))
      .orderBy(descOrder(portalMfaCodes.createdAt)).limit(1);

    if (!codeRow || codeRow.expiresAt < new Date()) throw new ValidationError('Code expired or not found');
    if (codeRow.attempts >= 5) throw new ValidationError('Too many attempts. Request a new code.');

    const codeValid = await compare(code, codeRow.codeHash);
    if (!codeValid) {
      await fastify.db.update(portalMfaCodes).set({ attempts: codeRow.attempts + 1 }).where(eq(portalMfaCodes.id, codeRow.id));
      throw new ValidationError('Invalid code');
    }

    // Consume the code
    await fastify.db.delete(portalMfaCodes).where(eq(portalMfaCodes.id, codeRow.id));

    // Load contact, issue real tokens
    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, payload.sub), eq(contacts.tenantId, payload.tid))).limit(1);
    if (!contact || !contact.portalEnabled) throw new ValidationError('Account disabled');

    // Reset counter (MFA was completed)
    await fastify.db.update(contacts).set({
      portalLoginsWithoutMfa: 0, updatedAt: new Date(),
    }).where(eq(contacts.id, contact.id));

    const portalRole = (contact.portalRole as string) ?? 'user';
    const portalPerms = (contact.portalPermissions as string[]) ?? ['tickets'];

    const accessToken = fastify.jwt.sign(
      { jti: randomUUID(), sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', portalRole, perms: portalPerms, type: 'access' as const },
      { expiresIn: '4h' },
    );
    const refreshToken = fastify.jwt.sign(
      { jti: randomUUID(), sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', portalRole, perms: portalPerms, type: 'refresh' as const },
      { expiresIn: '7d' },
    );

    return {
      accessToken, refreshToken,
      user: { id: contact.id, name: `${contact.firstName} ${contact.lastName}`, email: contact.email },
      customerId: contact.customerId, portalRole, portalPermissions: portalPerms,
      hasSecondFactor: true,
    };
  });

  // Set up SMS MFA — step 1: save phone + send verification code
  fastify.post('/api/v1/portal/me/mfa/sms/setup', async (request) => {
    const user = request.user as any;
    const { phone, password } = request.body as { phone: string; password?: string };

    // Require the current password — a session token alone must not be able to
    // point the MFA phone at a new number.
    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, user.sub), eq(contacts.tenantId, user.tid))).limit(1);
    if (!contact?.portalPasswordHash) throw new ValidationError('Account error');
    if (!password || !(await compare(password, contact.portalPasswordHash))) {
      throw new ValidationError('Enter your current password to change SMS verification.');
    }

    // Normalize to E.164 (basic)
    const digits = phone.replace(/\D/g, '');
    const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;
    if (!/^\+1\d{10}$/.test(e164)) throw new ValidationError('Invalid US phone number');

    const { generateSmsCode, sendSms } = await import('../../services/sms.js');
    const { hash: hashPw } = await import('bcryptjs');
    const code = generateSmsCode();
    const codeHash = await hashPw(code, 10);

    // Hold the candidate phone on the setup code — the live portalMfaPhone is
    // NOT touched until /verify confirms a code sent to this new number.
    const { portalMfaCodes } = await import('@rivertown/db');
    await fastify.db.insert(portalMfaCodes).values({
      tenantId: user.tid, contactId: user.sub, codeHash, phone: e164,
      purpose: 'setup', expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    });

    const result = await sendSms({ to: e164, message: `Your Rivertown Technology setup code is ${code}. Expires in 10 minutes.` }, fastify.db, user.tid);
    if (!result.success) throw new ValidationError(result.error || 'Failed to send SMS');

    return { success: true, phoneHint: '***-***-' + e164.slice(-4) };
  });

  // Set up SMS MFA — step 2: verify code and enable
  fastify.post('/api/v1/portal/me/mfa/sms/verify', async (request) => {
    const user = request.user as any;
    const { code } = request.body as { code: string };
    if (!/^\d{6}$/.test(code)) throw new ValidationError('Invalid code format');

    const { portalMfaCodes } = await import('@rivertown/db');
    const { desc: descOrder } = await import('drizzle-orm');
    const [codeRow] = await fastify.db.select().from(portalMfaCodes)
      .where(and(
        eq(portalMfaCodes.contactId, user.sub),
        eq(portalMfaCodes.tenantId, user.tid),
        eq(portalMfaCodes.purpose, 'setup'),
      ))
      .orderBy(descOrder(portalMfaCodes.createdAt)).limit(1);

    if (!codeRow || codeRow.expiresAt < new Date()) throw new ValidationError('Code expired. Request a new one.');
    if (!codeRow.phone) throw new ValidationError('Setup expired. Please start again.');
    const valid = await compare(code, codeRow.codeHash);
    if (!valid) throw new ValidationError('Invalid code');

    await fastify.db.delete(portalMfaCodes).where(eq(portalMfaCodes.id, codeRow.id));

    // Only now, after verifying a code sent to the new number, commit it.
    await fastify.db.update(contacts).set({
      portalMfaPhone: codeRow.phone,
      portalMfaEnabled: true,
      portalMfaMethod: 'sms',
      portalMfaVerifiedAt: new Date(),
      portalLoginsWithoutMfa: 0,
      updatedAt: new Date(),
    }).where(and(eq(contacts.id, user.sub), eq(contacts.tenantId, user.tid)));

    return { success: true };
  });

  // Disable SMS MFA
  fastify.post('/api/v1/portal/me/mfa/sms/disable', async (request) => {
    const user = request.user as any;
    const { password } = request.body as { password: string };

    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, user.sub), eq(contacts.tenantId, user.tid))).limit(1);
    if (!contact?.portalPasswordHash) throw new ValidationError('Account error');

    const valid = await compare(password, contact.portalPasswordHash);
    if (!valid) throw new ValidationError('Invalid password');

    await fastify.db.update(contacts).set({
      portalMfaEnabled: false,
      portalMfaMethod: null,
      portalMfaPhone: null,
      portalMfaVerifiedAt: null,
      updatedAt: new Date(),
    }).where(eq(contacts.id, user.sub));

    return { success: true };
  });

  // ===== CHANGE PASSWORD =====

  fastify.post('/api/v1/portal/auth/change-password', async (request) => {
    const user = getPortalUser(request);
    const { currentPassword, newPassword } = request.body as { currentPassword: string; newPassword: string };

    if (!newPassword || newPassword.length < 15) {
      throw new ValidationError('Password must be at least 15 characters');
    }

    const [contact] = await fastify.db.select().from(contacts)
      .where(eq(contacts.id, user.sub)).limit(1);
    if (!contact?.portalPasswordHash) throw new ValidationError('Account error');

    const valid = await compare(currentPassword, contact.portalPasswordHash);
    if (!valid) throw new ValidationError('Current password is incorrect');

    const newHash = await hash(newPassword, 12);
    await fastify.db.update(contacts).set({
      portalPasswordHash: newHash,
      mustChangePassword: false,
      updatedAt: new Date(),
    }).where(eq(contacts.id, user.sub));

    return { success: true };
  });

  // Portal logout — blacklist current token
  fastify.post('/api/v1/portal/auth/logout', async (request) => {
    const { blacklistToken } = await import('../../common/token-blacklist.js');
    const payload = request.user as any;
    if (payload.jti && payload.exp) {
      await blacklistToken(payload.jti, payload.exp);
    }
    return { success: true };
  });

  // ===== USER PROFILE / SETTINGS =====

  // Get current user profile
  fastify.get('/api/v1/portal/me', async (request) => {
    const user = request.user as any;
    const [contact] = await fastify.db.select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      phone: contacts.phone,
      jobTitle: contacts.jobTitle,
      portalRole: contacts.portalRole,
      portalPermissions: contacts.portalPermissions,
      customerId: contacts.customerId,
      portalMfaEnabled: contacts.portalMfaEnabled,
      portalMfaMethod: contacts.portalMfaMethod,
      portalMfaPhone: contacts.portalMfaPhone,
      portalLoginsWithoutMfa: contacts.portalLoginsWithoutMfa,
    }).from(contacts)
      .where(and(eq(contacts.id, user.sub), eq(contacts.tenantId, user.tid)))
      .limit(1);

    if (!contact) throw new NotFoundError('Contact', user.sub);
    // Mask phone number
    const phoneHint = contact.portalMfaPhone ? '***-***-' + contact.portalMfaPhone.slice(-4) : null;
    return { ...contact, portalMfaPhone: phoneHint };
  });

  // Update own profile
  fastify.patch('/api/v1/portal/me', async (request) => {
    const user = request.user as any;
    const body = request.body as { firstName?: string; lastName?: string; phone?: string; jobTitle?: string };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.firstName !== undefined) updates.firstName = body.firstName.trim();
    if (body.lastName !== undefined) updates.lastName = body.lastName.trim();
    if (body.phone !== undefined) updates.phone = body.phone.trim() || null;
    if (body.jobTitle !== undefined) updates.jobTitle = body.jobTitle.trim() || null;

    await fastify.db.update(contacts).set(updates)
      .where(and(eq(contacts.id, user.sub), eq(contacts.tenantId, user.tid)));

    return { success: true };
  });

  // ===== PASSKEY MANAGEMENT =====

  // List my passkeys
  fastify.get('/api/v1/portal/me/passkeys', async (request) => {
    const { passkeyCredentials } = await import('@rivertown/db');
    const user = request.user as any;
    const creds = await fastify.db.select({
      id: passkeyCredentials.id,
      deviceType: passkeyCredentials.deviceType,
      backedUp: passkeyCredentials.backedUp,
      createdAt: passkeyCredentials.createdAt,
    }).from(passkeyCredentials)
      .where(and(eq(passkeyCredentials.contactId, user.sub), eq(passkeyCredentials.tenantId, user.tid)))
      .orderBy(desc(passkeyCredentials.createdAt));
    return creds;
  });

  // Delete a passkey
  fastify.delete('/api/v1/portal/me/passkeys/:id', async (request) => {
    const { passkeyCredentials } = await import('@rivertown/db');
    const user = request.user as any;
    const { id } = request.params as { id: string };

    await fastify.db.delete(passkeyCredentials)
      .where(and(
        eq(passkeyCredentials.id, id),
        eq(passkeyCredentials.contactId, user.sub),
        eq(passkeyCredentials.tenantId, user.tid),
      ));

    return { success: true };
  });

  // ===== CUSTOMER BILLING SETTINGS (admin only) =====

  fastify.get('/api/v1/portal/billing', async (request) => {
    const { customers } = await import('@rivertown/db');
    const user = request.user as any;
    if (user.portalRole !== 'admin') throw new ForbiddenError('Admin access required');

    const [customer] = await fastify.db.select({
      name: customers.name,
      billingEmail: customers.billingEmail,
      ccBillingEmail: customers.ccBillingEmail,
      phone: customers.phone,
      address: customers.address,
      city: customers.city,
      state: customers.state,
      zip: customers.zip,
      creditBalanceCents: customers.creditBalanceCents,
    }).from(customers)
      .where(and(eq(customers.id, user.cid), eq(customers.tenantId, user.tid)))
      .limit(1);

    if (!customer) throw new NotFoundError('Customer', user.cid);
    return customer;
  });

  fastify.patch('/api/v1/portal/billing', async (request) => {
    const { customers } = await import('@rivertown/db');
    const user = request.user as any;
    if (user.portalRole !== 'admin') throw new ForbiddenError('Admin access required');

    const body = request.body as {
      billingEmail?: string; ccBillingEmail?: string; phone?: string;
      address?: string; city?: string; state?: string; zip?: string;
    };

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (body.billingEmail !== undefined) updates.billingEmail = body.billingEmail.trim() || null;
    if (body.ccBillingEmail !== undefined) updates.ccBillingEmail = body.ccBillingEmail.trim() || null;
    if (body.phone !== undefined) updates.phone = body.phone.trim() || null;
    if (body.address !== undefined) updates.address = body.address.trim() || null;
    if (body.city !== undefined) updates.city = body.city.trim() || null;
    if (body.state !== undefined) updates.state = body.state.trim() || null;
    if (body.zip !== undefined) updates.zip = body.zip.trim() || null;

    await fastify.db.update(customers).set(updates)
      .where(and(eq(customers.id, user.cid), eq(customers.tenantId, user.tid)));

    return { success: true };
  });

  // ===== DASHBOARD STATS =====

  fastify.get('/api/v1/portal/stats', async (request) => {
    const user = getPortalUser(request);

    const [ticketStats] = await fastify.db.select({
      open: count(sql`CASE WHEN ${tickets.status} NOT IN ('resolved', 'closed') THEN 1 END`),
      total: count(),
    }).from(tickets)
      .where(and(eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)));

    const result: Record<string, unknown> = {
      tickets: { open: Number(ticketStats?.open ?? 0), total: Number(ticketStats?.total ?? 0) },
    };

    // Outstanding-balance figures are billing data — only for billing users.
    const hasBilling = user.portalRole === 'admin' || (user.perms ?? []).includes('billing');
    if (hasBilling) {
      const [invoiceStats] = await fastify.db.select({
        outstanding: count(sql`CASE WHEN ${invoices.status} IN ('sent', 'overdue') THEN 1 END`),
        outstandingCents: sql<number>`COALESCE(SUM(CASE WHEN ${invoices.status} IN ('sent', 'overdue') THEN ${invoices.totalCents} - ${invoices.amountPaidCents} - ${invoices.creditsAppliedCents} ELSE 0 END), 0)`,
      }).from(invoices)
        .where(and(eq(invoices.tenantId, user.tid), eq(invoices.customerId, user.cid)));
      result.invoices = { outstanding: Number(invoiceStats?.outstanding ?? 0), outstandingCents: Number(invoiceStats?.outstandingCents ?? 0) };
    }

    return result;
  });

  // ===== TICKETS =====

  // Customer-safe ticket columns — omits internal routing/SLA fields
  // (assignedTo, queueId, slaPolicyId, slaBreached, slaResponseMet, etc.).
  const portalTicketCols = {
    id: tickets.id, ticketNumber: tickets.ticketNumber, subject: tickets.subject,
    description: tickets.description, status: tickets.status, priority: tickets.priority,
    categoryId: tickets.categoryId, subcategoryId: tickets.subcategoryId,
    createdAt: tickets.createdAt, updatedAt: tickets.updatedAt,
  };

  fastify.get('/api/v1/portal/tickets', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    return fastify.db.select(portalTicketCols).from(tickets)
      .where(and(eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)))
      .orderBy(desc(tickets.createdAt)).limit(50);
  });

  fastify.post('/api/v1/portal/tickets', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    const { subject, description, categoryId, subcategoryId } = request.body as {
      subject: string; description?: string; categoryId?: string; subcategoryId?: string;
    };

    if (!subject?.trim()) throw new ValidationError('Subject is required');

    // Atomic ticket numbering (avoids read-then-write race)
    const nextNum = await getNextTicketNumber(fastify.db, user.tid);

    const values: Record<string, unknown> = {
      tenantId: user.tid, ticketNumber: nextNum, customerId: user.cid,
      contactId: user.sub, subject: subject.trim(), description: description?.trim(),
      status: 'new', priority: 'medium', ticketType: 'service_request', source: 'portal',
    };
    // Only accept category/subcategory ids that belong to this tenant, so a
    // portal user can't attach another tenant's category reference.
    if (categoryId) {
      const [cat] = await fastify.db.select({ id: ticketCategories.id }).from(ticketCategories)
        .where(and(eq(ticketCategories.id, categoryId), eq(ticketCategories.tenantId, user.tid))).limit(1);
      if (cat) values.categoryId = categoryId;
    }
    if (subcategoryId) {
      const [sub] = await fastify.db.select({ id: ticketSubcategories.id, categoryId: ticketSubcategories.categoryId })
        .from(ticketSubcategories)
        .where(and(eq(ticketSubcategories.id, subcategoryId), eq(ticketSubcategories.tenantId, user.tid))).limit(1);
      if (sub && (!values.categoryId || sub.categoryId === values.categoryId)) values.subcategoryId = subcategoryId;
    }

    const [ticket] = await fastify.db.insert(tickets).values(values as any).returning();

    // Apply SLA
    try {
      const { calculateSla } = await import('../../services/sla-calculator.js');
      const sla = await calculateSla(fastify.db, user.tid, user.cid, 'medium', new Date());
      if (sla.slaPolicyId) {
        await fastify.db.update(tickets).set({
          slaDueAt: sla.slaDueAt, slaResponseDueAt: sla.slaResponseDueAt,
          slaResolutionDueAt: sla.slaResolutionDueAt, slaPolicyId: sla.slaPolicyId,
        }).where(eq(tickets.id, ticket.id));
      }
    } catch { /* SLA is best-effort */ }

    return ticket;
  });

  fastify.get('/api/v1/portal/tickets/:id', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    const [ticket] = await fastify.db.select(portalTicketCols).from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)))
      .limit(1);
    if (!ticket) throw new NotFoundError('Ticket', id);
    return ticket;
  });

  fastify.get('/api/v1/portal/tickets/:id/comments', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    // Verify the ticket belongs to this customer before returning its comments
    const [ticket] = await fastify.db.select({ id: tickets.id }).from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)))
      .limit(1);
    if (!ticket) throw new NotFoundError('Ticket', id);
    return fastify.db.select().from(ticketComments)
      .where(and(eq(ticketComments.ticketId, id), eq(ticketComments.tenantId, user.tid), eq(ticketComments.isInternal, false)))
      .orderBy(ticketComments.createdAt);
  });

  fastify.post('/api/v1/portal/tickets/:id/comments', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'tickets');
    const { body } = request.body as { body: string };
    if (!body?.trim()) throw new ValidationError('Comment body is required');

    // Verify ticket belongs to this customer
    const [ticket] = await fastify.db.select({ id: tickets.id }).from(tickets)
      .where(and(eq(tickets.id, id), eq(tickets.tenantId, user.tid), eq(tickets.customerId, user.cid)))
      .limit(1);
    if (!ticket) throw new NotFoundError('Ticket', id);

    const [comment] = await fastify.db.insert(ticketComments).values({
      tenantId: user.tid, ticketId: id, authorType: 'contact', authorId: user.sub,
      body: body.trim(), isInternal: false,
    }).returning();

    // Fire customer_replied workflow trigger
    const [fullTicket] = await fastify.db.select().from(tickets).where(eq(tickets.id, id)).limit(1);
    if (fullTicket) {
      import('../../services/workflow-engine.js').then(({ evaluateWorkflowRules }) => {
        evaluateWorkflowRules(fastify.db, user.tid, 'customer_replied', fullTicket).catch(() => {});
      });
    }

    return comment;
  });

  // ===== INVOICES =====

  // Customer-safe invoice columns — omits internal fields (notes, qboInvoiceId,
  // stripeInvoiceId).
  const portalInvoiceCols = {
    id: invoices.id, invoiceNumber: invoices.invoiceNumber, status: invoices.status,
    issueDate: invoices.issueDate, dueDate: invoices.dueDate,
    subtotalCents: invoices.subtotalCents, taxCents: invoices.taxCents,
    totalCents: invoices.totalCents, amountPaidCents: invoices.amountPaidCents,
    creditsAppliedCents: invoices.creditsAppliedCents, createdAt: invoices.createdAt,
  };

  fastify.get('/api/v1/portal/invoices', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    return fastify.db.select(portalInvoiceCols).from(invoices)
      .where(and(eq(invoices.tenantId, user.tid), eq(invoices.customerId, user.cid)))
      .orderBy(desc(invoices.createdAt)).limit(50);
  });

  fastify.get('/api/v1/portal/invoices/:id', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [invoice] = await fastify.db.select(portalInvoiceCols).from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, user.tid), eq(invoices.customerId, user.cid)))
      .limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);
    return invoice;
  });

  // Payment history for one invoice — the customer's receipts
  fastify.get('/api/v1/portal/invoices/:id/payments', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [invoice] = await fastify.db.select({ id: invoices.id }).from(invoices)
      .where(and(eq(invoices.id, id), eq(invoices.tenantId, user.tid), eq(invoices.customerId, user.cid)))
      .limit(1);
    if (!invoice) throw new NotFoundError('Invoice', id);
    return fastify.db.select({
      id: payments.id,
      amountCents: payments.amountCents,
      paymentMethod: payments.paymentMethod,
      paidAt: payments.paidAt,
    }).from(payments)
      .where(and(eq(payments.invoiceId, id), eq(payments.tenantId, user.tid)))
      .orderBy(desc(payments.paidAt));
  });

  // ===== AGREEMENTS (MSAs — current, previous versions, and any awaiting signature) =====

  fastify.get('/api/v1/portal/agreements', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const rows = await fastify.db.select({
      id: agreements.id,
      title: agreements.title,
      status: agreements.status,
      sentAt: agreements.sentAt,
      signedAt: agreements.signedAt,
      expiresAt: agreements.expiresAt,
      previousAgreementId: agreements.previousAgreementId,
      createdAt: agreements.createdAt,
    }).from(agreements)
      .where(and(eq(agreements.tenantId, user.tid), eq(agreements.customerId, user.cid)))
      .orderBy(desc(agreements.createdAt)).limit(50);
    // Drafts are internal until sent
    return rows.filter((r: { status: string }) => r.status !== 'draft');
  });

  // Mints the same short-lived preview token the staff app uses, after an
  // ownership check — the existing public agreement PDF route accepts it.
  fastify.post('/api/v1/portal/agreements/:id/preview-token', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [agreement] = await fastify.db.select({ id: agreements.id, status: agreements.status }).from(agreements)
      .where(and(eq(agreements.id, id), eq(agreements.tenantId, user.tid), eq(agreements.customerId, user.cid)))
      .limit(1);
    if (!agreement || agreement.status === 'draft') throw new NotFoundError('Agreement', id);
    const token = fastify.jwt.sign(
      { sub: user.sub, tid: user.tid, role: 'portal_user', type: 'preview' as const, resource: `agreement:${id}` },
      { expiresIn: '60s' },
    );
    return { token };
  });

  // ===== QUOTES =====

  fastify.get('/api/v1/portal/quotes', async (request) => {
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    return fastify.db.select().from(quotes)
      .where(and(eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid)))
      .orderBy(desc(quotes.createdAt)).limit(50);
  });

  // Preview token for the quote PDF (includes the signature block once signed)
  fastify.post('/api/v1/portal/quotes/:id/preview-token', async (request) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [quote] = await fastify.db.select({ id: quotes.id }).from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid)))
      .limit(1);
    if (!quote) throw new NotFoundError('Quote', id);
    const token = fastify.jwt.sign(
      { sub: user.sub, tid: user.tid, role: 'portal_user', type: 'preview' as const, resource: `quote:${id}` },
      { expiresIn: '60s' },
    );
    return { token };
  });

  fastify.post('/api/v1/portal/quotes/:id/approve', async (request, reply) => {
    const { id } = request.params as { id: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    if (!['sent', 'viewed'].includes(existing.status)) {
      reply.code(409).send({ error: 'INVALID_STATUS', message: `Cannot approve a quote with status "${existing.status}"` });
      return;
    }
    const [updated] = await fastify.db.update(quotes).set({ status: 'approved', approvedAt: new Date(), approvedBy: user.sub, updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid))).returning();
    return updated;
  });

  fastify.post('/api/v1/portal/quotes/:id/reject', async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { reason?: string };
    const user = getPortalUser(request);
    requirePerm(user, 'billing');
    const [existing] = await fastify.db.select().from(quotes)
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid))).limit(1);
    if (!existing) throw new NotFoundError('Quote', id);
    if (!['sent', 'viewed'].includes(existing.status)) {
      reply.code(409).send({ error: 'INVALID_STATUS', message: `Cannot reject a quote with status "${existing.status}"` });
      return;
    }
    const [updated] = await fastify.db.update(quotes).set({ status: 'rejected', declineReason: body.reason?.slice(0, 2000) ?? null, updatedAt: new Date() })
      .where(and(eq(quotes.id, id), eq(quotes.tenantId, user.tid), eq(quotes.customerId, user.cid))).returning();
    return updated;
  });

  // ===== ASSETS =====

  fastify.get('/api/v1/portal/assets', async (request) => {
    const user = getPortalUser(request);
    // Customer-safe columns only — never expose internal RMM fields
    // (ipAddress, macAddress, notes, externalRmmId, screenconnectSessionId).
    return fastify.db.select({
      id: assets.id,
      name: assets.name,
      type: assets.assetType,
      serialNumber: assets.serialNumber,
      status: assets.status,
    }).from(assets)
      .where(and(eq(assets.tenantId, user.tid), eq(assets.customerId, user.cid)))
      .orderBy(assets.name).limit(100);
  });

  // ===== CATEGORIES (for ticket submission) =====

  fastify.get('/api/v1/portal/ticket-categories', async (request) => {
    const user = getPortalUser(request);
    const { ticketCategories, ticketSubcategories } = await import('@rivertown/db');
    const categories = await fastify.db.select().from(ticketCategories)
      .where(and(eq(ticketCategories.tenantId, user.tid), eq(ticketCategories.isActive, true)))
      .orderBy(ticketCategories.sortOrder);
    const subcategories = await fastify.db.select().from(ticketSubcategories)
      .where(and(eq(ticketSubcategories.tenantId, user.tid), eq(ticketSubcategories.isActive, true)))
      .orderBy(ticketSubcategories.sortOrder);
    return categories.map(cat => ({
      ...cat,
      subcategories: subcategories.filter(sub => sub.categoryId === cat.id),
    }));
  });

  // ===== USER MANAGEMENT (portal admin only) =====

  // List portal users for this company
  fastify.get('/api/v1/portal/users', async (request) => {
    const user = getPortalUser(request);
    if (user.portalRole !== 'admin') throw new ForbiddenError('Only portal admins can manage users');

    const portalUsers = await fastify.db.select({
      id: contacts.id,
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      portalEnabled: contacts.portalEnabled,
      portalRole: contacts.portalRole,
      portalPermissions: contacts.portalPermissions,
    }).from(contacts)
      .where(and(eq(contacts.tenantId, user.tid), eq(contacts.customerId, user.cid)))
      .orderBy(contacts.firstName);

    return portalUsers;
  });

  // Invite / enable portal access for another contact (portal admin)
  fastify.post('/api/v1/portal/users/:contactId/enable', async (request) => {
    const user = getPortalUser(request);
    if (user.portalRole !== 'admin') throw new ForbiddenError('Only portal admins can manage users');

    const { contactId } = request.params as { contactId: string };
    const { password, permissions } = request.body as { password: string; permissions?: string[] };

    if (!password || password.length < 12) throw new ValidationError('Password must be at least 12 characters');

    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, user.tid), eq(contacts.customerId, user.cid)))
      .limit(1);
    if (!contact) throw new NotFoundError('Contact', contactId);

    const passwordHash = await hash(password, 12);
    const [updated] = await fastify.db.update(contacts).set({
      portalEnabled: true,
      portalPasswordHash: passwordHash,
      portalRole: 'user',
      portalPermissions: permissions ?? ['tickets'],
      updatedAt: new Date(),
    }).where(eq(contacts.id, contactId)).returning();

    return {
      id: updated.id, firstName: updated.firstName, lastName: updated.lastName,
      email: updated.email, portalRole: updated.portalRole, portalPermissions: updated.portalPermissions,
    };
  });

  // Update permissions for a portal user (portal admin)
  fastify.patch('/api/v1/portal/users/:contactId', async (request) => {
    const user = getPortalUser(request);
    if (user.portalRole !== 'admin') throw new ForbiddenError('Only portal admins can manage users');

    const { contactId } = request.params as { contactId: string };
    const { permissions } = request.body as { permissions: string[] };

    // Can't edit yourself
    if (contactId === user.sub) throw new ValidationError('Cannot change your own permissions');

    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, user.tid), eq(contacts.customerId, user.cid), eq(contacts.portalEnabled, true)))
      .limit(1);
    if (!contact) throw new NotFoundError('Contact', contactId);

    const [updated] = await fastify.db.update(contacts).set({
      portalPermissions: permissions,
      updatedAt: new Date(),
    }).where(eq(contacts.id, contactId)).returning();

    return {
      id: updated.id, portalRole: updated.portalRole, portalPermissions: updated.portalPermissions,
    };
  });

  // Revoke portal access (portal admin)
  fastify.post('/api/v1/portal/users/:contactId/revoke', async (request) => {
    const user = getPortalUser(request);
    if (user.portalRole !== 'admin') throw new ForbiddenError('Only portal admins can manage users');

    const { contactId } = request.params as { contactId: string };
    if (contactId === user.sub) throw new ValidationError('Cannot revoke your own access');

    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, contactId), eq(contacts.tenantId, user.tid), eq(contacts.customerId, user.cid)))
      .limit(1);
    if (!contact) throw new NotFoundError('Contact', contactId);

    await fastify.db.update(contacts).set({
      portalEnabled: false,
      portalPasswordHash: null,
      portalRole: 'user',
      portalPermissions: ['tickets'],
      updatedAt: new Date(),
    }).where(eq(contacts.id, contactId));

    return { success: true };
  });

  // ===== PASSKEY (WebAuthn) AUTHENTICATION =====

  const RP_NAME = 'Rivertown Technology Portal';
  const RP_ID = process.env.PASSKEY_RP_ID || 'portal.rivertowntechnology.com';
  const ORIGIN = process.env.PASSKEY_ORIGIN || `https://${RP_ID}`;

  // In-memory challenge store (short-lived, 5 min TTL)
  const challengeStore = new Map<string, { challenge: string; expiresAt: number }>();
  const MAX_STORE_SIZE = 10000;
  function storeChallenge(key: string, challenge: string) {
    // Prevent unbounded growth — if we exceed max, purge expired + oldest half
    if (challengeStore.size >= MAX_STORE_SIZE) {
      const now = Date.now();
      for (const [k, v] of challengeStore) { if (v.expiresAt < now) challengeStore.delete(k); }
      if (challengeStore.size >= MAX_STORE_SIZE) {
        const keys = Array.from(challengeStore.keys()).slice(0, Math.floor(MAX_STORE_SIZE / 2));
        for (const k of keys) challengeStore.delete(k);
      }
    }
    challengeStore.set(key, { challenge, expiresAt: Date.now() + 5 * 60 * 1000 });
  }
  function getChallenge(key: string): string | null {
    const entry = challengeStore.get(key);
    challengeStore.delete(key);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.challenge;
  }
  // Periodic cleanup every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of challengeStore) { if (v.expiresAt < now) challengeStore.delete(k); }
  }, 5 * 60 * 1000);

  // Generate registration options (must be logged in)
  fastify.post('/api/v1/portal/auth/passkey/register-options', async (request) => {
    const { passkeyCredentials } = await import('@rivertown/db');
    const { generateRegistrationOptions } = await import('@simplewebauthn/server');
    const user = request.user as any;

    // Load the contact's real name + email so the browser shows something friendly
    const [contact] = await fastify.db.select({
      firstName: contacts.firstName, lastName: contacts.lastName, email: contacts.email,
    }).from(contacts).where(and(eq(contacts.id, user.sub), eq(contacts.tenantId, user.tid))).limit(1);
    if (!contact) throw new ValidationError('Contact not found');

    const displayName = `${contact.firstName} ${contact.lastName}`.trim() || contact.email;

    const existing = await fastify.db.select({ credentialId: passkeyCredentials.credentialId })
      .from(passkeyCredentials).where(eq(passkeyCredentials.contactId, user.sub));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: contact.email,
      userDisplayName: displayName,
      attestationType: 'none',
      excludeCredentials: existing.map(c => ({ id: c.credentialId })),
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'preferred',
      },
    });

    storeChallenge(`reg:${user.tid}:${user.sub}`, options.challenge);
    return options;
  });

  // Verify registration
  fastify.post('/api/v1/portal/auth/passkey/register', async (request) => {
    const { passkeyCredentials } = await import('@rivertown/db');
    const { verifyRegistrationResponse } = await import('@simplewebauthn/server');
    const user = request.user as any;
    const body = request.body as any;

    const expectedChallenge = getChallenge(`reg:${user.tid}:${user.sub}`);
    if (!expectedChallenge) throw new ValidationError('Registration challenge expired. Please try again.');

    const verification = await verifyRegistrationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new ValidationError('Passkey verification failed');
    }

    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

    await fastify.db.insert(passkeyCredentials).values({
      tenantId: user.tid,
      contactId: user.sub,
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64'),
      counter: credential.counter,
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      transports: body.response?.transports?.join(',') || null,
    });

    return { success: true, message: 'Passkey registered successfully' };
  });

  // Generate authentication options (public — takes email)
  fastify.post('/api/v1/portal/auth/passkey/login-options', {
    config: { public: true, rateLimit: { max: 10, timeWindow: '1 minute' } } as any,
  }, async (request) => {
    const { passkeyCredentials } = await import('@rivertown/db');
    const { generateAuthenticationOptions } = await import('@simplewebauthn/server');
    const { email } = (request.body ?? {}) as { email?: string };

    // Discoverable-credential flow (no email) — user's device picks which passkey
    if (!email) {
      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: 'preferred',
        // allowCredentials omitted → browser shows all available passkeys for this RP
      });
      // Store challenge keyed by its own value (unique random string)
      storeChallenge(`disc:${options.challenge}`, options.challenge);
      return options;
    }

    // Email-scoped flow (legacy)
    const [contact] = await fastify.db.select({ id: contacts.id, tenantId: contacts.tenantId })
      .from(contacts).where(eq(contacts.email, email.toLowerCase().trim())).limit(1);

    if (!contact) {
      // Don't reveal if contact exists — return generic discoverable options
      const options = await generateAuthenticationOptions({ rpID: RP_ID });
      storeChallenge(`disc:${options.challenge}`, options.challenge);
      return options;
    }

    const creds = await fastify.db.select({ credentialId: passkeyCredentials.credentialId, transports: passkeyCredentials.transports })
      .from(passkeyCredentials).where(eq(passkeyCredentials.contactId, contact.id));

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials: creds.map(c => ({
        id: c.credentialId,
        transports: (c.transports?.split(',') || []) as any[],
      })),
    });

    storeChallenge(`auth:${contact.id}:${contact.tenantId || ''}`, options.challenge);
    return options;
  });

  // Verify authentication (public)
  fastify.post('/api/v1/portal/auth/passkey/login', {
    config: { public: true, rateLimit: { max: 5, timeWindow: '5 minutes' } } as any,
  }, async (request) => {
    const { passkeyCredentials } = await import('@rivertown/db');
    const { verifyAuthenticationResponse } = await import('@simplewebauthn/server');
    const body = request.body as any;

    // Find the credential
    const [cred] = await fastify.db.select().from(passkeyCredentials)
      .where(eq(passkeyCredentials.credentialId, body.id)).limit(1);

    if (!cred) throw new ValidationError('Passkey not recognized');

    // Extract challenge from clientDataJSON (base64url encoded)
    let clientChallenge: string | null = null;
    try {
      const clientDataJson = body.response?.clientDataJSON || '';
      const decoded = Buffer.from(clientDataJson.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      const clientData = JSON.parse(decoded);
      clientChallenge = clientData.challenge;
    } catch { /* ignore */ }

    // Try discoverable-credential challenge first, then email-scoped challenge as fallback
    let expectedChallenge: string | null = null;
    if (clientChallenge) expectedChallenge = getChallenge(`disc:${clientChallenge}`);
    if (!expectedChallenge) expectedChallenge = getChallenge(`auth:${cred.contactId}:${cred.tenantId}`);
    if (!expectedChallenge) throw new ValidationError('Authentication challenge expired. Please try again.');

    const verification = await verifyAuthenticationResponse({
      response: body,
      expectedChallenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: cred.credentialId,
        publicKey: Buffer.from(cred.publicKey, 'base64'),
        counter: cred.counter,
        transports: (cred.transports?.split(',') || []) as any[],
      },
    });

    if (!verification.verified) throw new ValidationError('Passkey verification failed');

    // Replay protection: reject if new counter is not strictly greater than stored counter
    // (0 is allowed because some platform authenticators always report 0)
    const newCounter = verification.authenticationInfo.newCounter;
    if (newCounter !== 0 && newCounter <= cred.counter) {
      throw new ValidationError('Passkey authentication failed (replay detected)');
    }

    // Update counter atomically — only if it hasn't been changed since we read it
    const result = await fastify.db.update(passkeyCredentials)
      .set({ counter: newCounter })
      .where(and(eq(passkeyCredentials.id, cred.id), eq(passkeyCredentials.counter, cred.counter)))
      .returning({ id: passkeyCredentials.id });

    if (result.length === 0) {
      throw new ValidationError('Passkey authentication failed (concurrent use detected)');
    }

    // Get contact and issue JWT
    const [contact] = await fastify.db.select().from(contacts)
      .where(and(eq(contacts.id, cred.contactId), eq(contacts.tenantId, cred.tenantId))).limit(1);

    if (!contact || !contact.portalEnabled) throw new ValidationError('Portal access not enabled');

    const portalRole = contact.portalRole || 'user';
    const portalPerms = portalRole === 'admin' ? ['tickets', 'billing'] : ((contact.portalPermissions ?? ['tickets']) as string[]);

    const accessToken = fastify.jwt.sign(
      { jti: randomUUID(), sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', portalRole, perms: portalPerms, type: 'access' as const },
      { expiresIn: '4h' },
    );

    const refreshToken = fastify.jwt.sign(
      { jti: randomUUID(), sub: contact.id, tid: contact.tenantId, cid: contact.customerId, role: 'portal_user', portalRole, perms: portalPerms, type: 'refresh' as const },
      { expiresIn: '7d' },
    );

    return {
      accessToken,
      refreshToken,
      user: { id: contact.id, firstName: contact.firstName, lastName: contact.lastName, email: contact.email, portalRole },
    };
  });
}
