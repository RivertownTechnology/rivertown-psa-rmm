import { FastifyInstance } from 'fastify';
import { eq, and, sql } from 'drizzle-orm';
import { tenantSequences, integrationConfigs, tenants, users, emailTemplates, slaPolicies, customers, contracts, contractLineItems, invoices, tickets, ticketTimeEntries, taxRates } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { ValidationError } from '../../common/errors.js';

export async function settingsRoutes(fastify: FastifyInstance) {
  // ===== PROFILE =====

  // Update current user profile
  fastify.patch('/api/v1/settings/profile', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const body = request.body as { displayName?: string; currentPassword?: string; newPassword?: string };
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.displayName) update.displayName = body.displayName;
    if (body.newPassword && body.currentPassword) {
      const { compare, hash } = await import('bcryptjs');
      const [user] = await fastify.db.select().from(users).where(eq(users.id, request.user.sub)).limit(1);
      if (!user?.passwordHash) throw new ValidationError('Cannot change password');
      const valid = await compare(body.currentPassword, user.passwordHash);
      if (!valid) throw new ValidationError('Current password is incorrect');
      update.passwordHash = await hash(body.newPassword, 12);
    }
    await fastify.db.update(users).set(update).where(eq(users.id, request.user.sub));
    return { success: true };
  });

  // ===== SEQUENCES =====

  fastify.get(
    '/api/v1/settings/sequences',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const rows = await fastify.db
        .select()
        .from(tenantSequences)
        .where(eq(tenantSequences.tenantId, request.tenantId));
      const result: Record<string, number> = {};
      for (const row of rows) {
        result[row.sequenceName] = parseInt(row.currentValue, 10);
      }
      return result;
    },
  );

  fastify.patch(
    '/api/v1/settings/sequences',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const body = request.body as Record<string, number>;
      for (const [name, value] of Object.entries(body)) {
        if (!['ticket', 'invoice', 'quote'].includes(name)) {
          throw new ValidationError(`Invalid sequence name: ${name}`);
        }
        if (typeof value !== 'number' || value < 0 || !Number.isInteger(value)) {
          throw new ValidationError(`Value for ${name} must be a non-negative integer`);
        }
        const [existing] = await fastify.db
          .select()
          .from(tenantSequences)
          .where(and(eq(tenantSequences.tenantId, request.tenantId), eq(tenantSequences.sequenceName, name)))
          .limit(1);
        if (existing) {
          await fastify.db.update(tenantSequences).set({ currentValue: String(value) })
            .where(and(eq(tenantSequences.tenantId, request.tenantId), eq(tenantSequences.sequenceName, name)));
        } else {
          await fastify.db.insert(tenantSequences).values({ tenantId: request.tenantId, sequenceName: name, currentValue: String(value) });
        }
      }
      const rows = await fastify.db.select().from(tenantSequences).where(eq(tenantSequences.tenantId, request.tenantId));
      const result: Record<string, number> = {};
      for (const row of rows) result[row.sequenceName] = parseInt(row.currentValue, 10);
      return result;
    },
  );

  // ===== EMAIL SETTINGS =====

  fastify.get(
    '/api/v1/settings/email',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const [config] = await fastify.db
        .select()
        .from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'email')))
        .limit(1);

      if (!config) {
        return {
          isEnabled: false,
          smtpHost: '',
          smtpPort: 587,
          smtpUser: '',
          smtpPassword: '',
          fromAddress: '',
          fromName: '',
          useTls: true,
          provider: 'smtp',
        };
      }

      const creds = config.credentials as Record<string, unknown>;
      return {
        isEnabled: config.isEnabled,
        smtpHost: creds.smtpHost ?? '',
        smtpPort: creds.smtpPort ?? 587,
        smtpUser: creds.smtpUser ?? '',
        smtpPassword: creds.smtpPassword ? '••••••••' : '',
        fromAddress: creds.fromAddress ?? '',
        fromName: creds.fromName ?? '',
        useTls: creds.useTls ?? true,
        provider: creds.provider ?? 'smtp',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/email',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const body = request.body as {
        isEnabled: boolean;
        smtpHost: string;
        smtpPort: number;
        smtpUser: string;
        smtpPassword?: string;
        fromAddress: string;
        fromName: string;
        useTls: boolean;
        provider: string;
      };

      const [existing] = await fastify.db
        .select()
        .from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'email')))
        .limit(1);

      // Don't overwrite password with masked value
      let smtpPassword = body.smtpPassword;
      if (smtpPassword === '••••••••' && existing) {
        smtpPassword = (existing.credentials as Record<string, unknown>).smtpPassword as string;
      }

      const credentials = {
        smtpHost: body.smtpHost,
        smtpPort: body.smtpPort,
        smtpUser: body.smtpUser,
        smtpPassword,
        fromAddress: body.fromAddress,
        fromName: body.fromName,
        useTls: body.useTls,
        provider: body.provider,
      };

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled,
          credentials,
          updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId,
          provider: 'email',
          isEnabled: body.isEnabled,
          credentials,
        });
      }

      return { success: true };
    },
  );

  fastify.post(
    '/api/v1/settings/email/test',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { sendEmail } = await import('../../services/email.js');
      const { email } = request.body as { email?: string };
      const targetEmail = email ?? (request.user as any).email ?? 'test@test.com';

      const sent = await sendEmail(fastify.db, request.tenantId, {
        to: targetEmail,
        subject: 'Rivertown PSA - Test Email',
        html: '<h2>Test Email</h2><p>Your email configuration is working correctly.</p><p>This is an automated test from Rivertown PSA.</p>',
      });

      if (!sent) throw new ValidationError('Email sending failed. Check your SMTP configuration.');
      return { success: true, message: `Test email sent to ${targetEmail}` };
    },
  );

  // ===== BILLING EMAIL (Mailjet) =====

  fastify.get(
    '/api/v1/settings/billing-email',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'billing-email')))
        .limit(1);

      if (!config) {
        return {
          isEnabled: false,
          smtpHost: 'in-v3.mailjet.com',
          smtpPort: 587,
          apiKey: '',
          secretKey: '',
          fromAddress: '',
          fromName: '',
          replyTo: '',
        };
      }

      const creds = config.credentials as Record<string, unknown>;
      return {
        isEnabled: config.isEnabled,
        smtpHost: creds.smtpHost ?? 'in-v3.mailjet.com',
        smtpPort: creds.smtpPort ?? 587,
        apiKey: creds.apiKey ? '••••••••' + String(creds.apiKey).slice(-4) : '',
        secretKey: creds.secretKey ? '••••••••' : '',
        fromAddress: creds.fromAddress ?? '',
        fromName: creds.fromName ?? '',
        replyTo: creds.replyTo ?? '',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/billing-email',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const body = request.body as {
        isEnabled: boolean;
        smtpHost?: string;
        smtpPort?: number;
        apiKey?: string;
        secretKey?: string;
        fromAddress: string;
        fromName: string;
        replyTo?: string;
      };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'billing-email')))
        .limit(1);

      const prevCreds = (existing?.credentials ?? {}) as Record<string, unknown>;
      const credentials: Record<string, unknown> = {
        smtpHost: body.smtpHost || prevCreds.smtpHost || 'in-v3.mailjet.com',
        smtpPort: body.smtpPort ?? prevCreds.smtpPort ?? 587,
        apiKey: body.apiKey?.startsWith('••') ? prevCreds.apiKey : (body.apiKey || prevCreds.apiKey || ''),
        secretKey: body.secretKey?.startsWith('••') ? prevCreds.secretKey : (body.secretKey || prevCreds.secretKey || ''),
        fromAddress: body.fromAddress,
        fromName: body.fromName,
        replyTo: body.replyTo || '',
      };

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'billing-email',
          isEnabled: body.isEnabled, credentials,
        });
      }

      return { success: true };
    },
  );

  fastify.post(
    '/api/v1/settings/billing-email/test',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { sendBillingEmail } = await import('../../services/email.js');
      const { email } = request.body as { email?: string };
      const targetEmail = email ?? 'test@test.com';

      const sent = await sendBillingEmail(fastify.db, request.tenantId, {
        to: targetEmail,
        subject: 'Rivertown PSA - Billing Email Test',
        html: '<h2>Billing Email Test</h2><p>Your billing email (Mailjet) configuration is working correctly.</p>',
      });

      if (!sent) throw new ValidationError('Billing email sending failed. Check your Mailjet configuration.');
      return { success: true, message: `Test email sent to ${targetEmail}` };
    },
  );

  // ===== EMAIL-TO-TICKET =====

  fastify.post(
    '/api/v1/settings/email/check-inbox',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { processInboundEmails } = await import('../../services/email-to-ticket.js');
      const result = await processInboundEmails(fastify.db, request.tenantId);
      return result;
    },
  );

  // Get recent email log
  fastify.get(
    '/api/v1/settings/email/log',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { emailMessages } = await import('@rivertown/db');
      const { desc } = await import('drizzle-orm');
      const messages = await fastify.db.select().from(emailMessages)
        .where(eq(emailMessages.tenantId, request.tenantId))
        .orderBy(desc(emailMessages.createdAt))
        .limit(50);
      return messages;
    },
  );

  // ===== BLOCKED EMAILS =====

  fastify.get(
    '/api/v1/settings/email/blocked',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'email')))
        .limit(1);
      const creds = (config?.credentials ?? {}) as Record<string, unknown>;
      return { blocked: (creds.blockedEmails as string[]) ?? [] };
    },
  );

  fastify.put(
    '/api/v1/settings/email/blocked',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { blocked } = request.body as { blocked: string[] };
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'email')))
        .limit(1);
      if (config) {
        const creds = { ...(config.credentials as object), blockedEmails: blocked };
        await fastify.db.update(integrationConfigs).set({ credentials: creds, updatedAt: new Date() })
          .where(eq(integrationConfigs.id, config.id));
      }
      return { blocked };
    },
  );

  // ===== BILLING RATES =====

  // Get org defaults + all tech rates
  fastify.get(
    '/api/v1/settings/billing-rates',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const [tenant] = await fastify.db.select({
        defaultInternalCostCents: tenants.defaultInternalCostCents,
        defaultBillableRateCents: tenants.defaultBillableRateCents,
      }).from(tenants).where(eq(tenants.id, request.tenantId)).limit(1);

      const techList = await fastify.db.select({
        id: users.id,
        displayName: users.displayName,
        email: users.email,
        role: users.role,
        internalCostCents: users.internalCostCents,
        billableRateCents: users.billableRateCents,
      }).from(users)
        .where(and(eq(users.tenantId, request.tenantId), eq(users.isActive, true)))
        .orderBy(users.displayName);

      return {
        orgDefaults: {
          internalCostCents: tenant?.defaultInternalCostCents ?? 7500,
          billableRateCents: tenant?.defaultBillableRateCents ?? 15000,
        },
        techs: techList,
      };
    },
  );

  // Update org default rates
  fastify.patch(
    '/api/v1/settings/billing-rates/org',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { internalCostCents, billableRateCents } = request.body as {
        internalCostCents?: number; billableRateCents?: number;
      };

      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (internalCostCents !== undefined) update.defaultInternalCostCents = internalCostCents;
      if (billableRateCents !== undefined) update.defaultBillableRateCents = billableRateCents;

      await fastify.db.update(tenants).set(update).where(eq(tenants.id, request.tenantId));
      return { success: true };
    },
  );

  // Update per-tech rate
  fastify.patch(
    '/api/v1/settings/billing-rates/tech/:userId',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { userId } = request.params as { userId: string };
      const { internalCostCents, billableRateCents } = request.body as {
        internalCostCents?: number | null; billableRateCents?: number | null;
      };

      const update: Record<string, unknown> = { updatedAt: new Date() };
      if (internalCostCents !== undefined) update.internalCostCents = internalCostCents;
      if (billableRateCents !== undefined) update.billableRateCents = billableRateCents;

      await fastify.db.update(users).set(update)
        .where(and(eq(users.id, userId), eq(users.tenantId, request.tenantId)));
      return { success: true };
    },
  );

  // ===== TIMEZONE =====

  // Get/set tenant timezone
  fastify.get('/api/v1/settings/timezone', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const [tenant] = await fastify.db.select({ timezone: tenants.timezone })
      .from(tenants).where(eq(tenants.id, request.tenantId)).limit(1);
    return { timezone: tenant?.timezone ?? 'America/New_York' };
  });

  fastify.patch('/api/v1/settings/timezone', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { timezone } = request.body as { timezone: string };
    await fastify.db.update(tenants).set({ timezone, updatedAt: new Date() })
      .where(eq(tenants.id, request.tenantId));
    return { timezone };
  });

  // ===== BUSINESS PROFILE =====

  fastify.get('/api/v1/settings/business-profile', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const [tenant] = await fastify.db.select().from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    return {
      businessName: settings.businessName ?? '',
      businessAddress: settings.businessAddress ?? '',
      businessCity: settings.businessCity ?? '',
      businessState: settings.businessState ?? '',
      businessZip: settings.businessZip ?? '',
      businessPhone: settings.businessPhone ?? '',
      businessEmail: settings.businessEmail ?? '',
      businessWebsite: settings.businessWebsite ?? '',
      businessLogo: settings.businessLogo ?? '',
      invoiceStyle: settings.invoiceStyle ?? 'modern',
      quoteStyle: settings.quoteStyle ?? 'modern',
      invoiceFooter: settings.invoiceFooter ?? 'Thank you for your business!',
      quoteFooter: settings.quoteFooter ?? 'This quote is valid for 30 days.',
      invoicePaymentTerms: settings.invoicePaymentTerms ?? 'Net 30',
    };
  });

  fastify.put('/api/v1/settings/business-profile', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const body = request.body as Record<string, unknown>;
    const [tenant] = await fastify.db.select().from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const existing = (tenant?.settings ?? {}) as Record<string, unknown>;
    const updated = { ...existing, ...body };
    await fastify.db.update(tenants).set({ settings: updated, updatedAt: new Date() })
      .where(eq(tenants.id, request.tenantId));
    return { success: true };
  });

  // ===== EMAIL TEMPLATES =====

  fastify.get('/api/v1/settings/templates', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    return fastify.db.select().from(emailTemplates)
      .where(eq(emailTemplates.tenantId, request.tenantId))
      .orderBy(emailTemplates.templateType);
  });

  fastify.get('/api/v1/settings/templates/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [template] = await fastify.db.select().from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.tenantId, request.tenantId))).limit(1);
    if (!template) throw new ValidationError('Template not found');
    return template;
  });

  fastify.post('/api/v1/settings/templates', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as { templateType: string; name: string; subject: string; bodyHtml: string; bodyText?: string };
    const [template] = await fastify.db.insert(emailTemplates).values({
      tenantId: request.tenantId, ...body,
    }).returning();
    reply.code(201);
    return template;
  });

  fastify.patch('/api/v1/settings/templates/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{ name: string; subject: string; bodyHtml: string; bodyText: string; isActive: boolean }>;
    const [updated] = await fastify.db.update(emailTemplates)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.tenantId, request.tenantId))).returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/templates/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  fastify.post('/api/v1/settings/templates/seed-defaults', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { getDefaultTemplates } = await import('../../services/template-renderer.js');
    const defaults = getDefaultTemplates();
    let created = 0;
    for (const tmpl of defaults) {
      const [existing] = await fastify.db.select().from(emailTemplates)
        .where(and(eq(emailTemplates.tenantId, request.tenantId), eq(emailTemplates.templateType, tmpl.templateType)))
        .limit(1);
      if (!existing) {
        await fastify.db.insert(emailTemplates).values({ tenantId: request.tenantId, ...tmpl, isDefault: true });
        created++;
      }
    }
    return { created, total: defaults.length };
  });

  fastify.post('/api/v1/settings/templates/:id/preview', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [template] = await fastify.db.select().from(emailTemplates)
      .where(and(eq(emailTemplates.id, id), eq(emailTemplates.tenantId, request.tenantId))).limit(1);
    if (!template) throw new ValidationError('Template not found');

    // Use body from request if provided (live editing), otherwise use stored template
    const body = (request.body ?? {}) as { bodyHtml?: string };
    const htmlToRender = body.bodyHtml || template.bodyHtml;
    const subjectToRender = template.subject;

    const [tenant] = await fastify.db.select().from(tenants).where(eq(tenants.id, request.tenantId)).limit(1);
    const s = (tenant?.settings ?? {}) as Record<string, string>;
    const { renderTemplate } = await import('../../services/template-renderer.js');

    const sampleVars: Record<string, string> = {
      // Business
      businessName: s.businessName || 'Your Company',
      businessLogo: s.businessLogo || '',
      businessAddress: s.businessAddress || '123 Main St',
      businessCity: s.businessCity || 'City',
      businessState: s.businessState || 'ST',
      businessZip: s.businessZip || '12345',
      businessPhone: s.businessPhone || '(555) 123-4567',
      businessEmail: s.businessEmail || 'info@company.com',
      // Customer
      customerName: 'Acme Corporation',
      customerCompany: 'Acme Corporation',
      customerEmail: 'billing@acme.com',
      customerPhone: '(555) 987-6543',
      customerAddress: '456 Oak Ave',
      customerCity: 'Springfield',
      customerState: 'IL',
      customerZip: '62704',
      customerFullAddress: '456 Oak Ave, Springfield, IL 62704',
      // Bill To (same as customer for preview)
      billToName: 'John Smith',
      billToCompany: 'Acme Corporation',
      billToAddress: '456 Oak Ave',
      billToCity: 'Springfield',
      billToState: 'IL',
      billToZip: '62704',
      billToFullAddress: '456 Oak Ave, Springfield, IL 62704',
      // Contact
      contactName: 'John Smith',
      contactEmail: 'john@acme.com',
      contactPhone: '(555) 111-2222',
      contactJobTitle: 'IT Manager',
      // Ticket
      ticketNumber: '1042',
      ticketSubject: 'Server not responding',
      ticketPriority: 'High',
      ticketStatus: 'Open',
      ticketDescription: 'The main production server is not responding to ping requests.',
      commentBody: 'We have identified the issue and are working on a fix. Expected resolution within 2 hours.',
      // Quote
      quoteNumber: '1001',
      quoteTitle: 'Managed Services Proposal',
      quoteSummary: 'Comprehensive managed services including monitoring, patching, and helpdesk support.',
      validUntil: '2026-04-30',
      // Invoice
      invoiceNumber: '1001',
      issueDate: '2026-03-28',
      dueDate: '2026-04-05',
      totalFormatted: '2,500.00',
      amountFormatted: '2,500.00',
      invoiceNotes: 'Services for April 2026',
      invoicePaymentTerms: s.invoicePaymentTerms || 'Net 30',
      invoiceFooter: s.invoiceFooter || 'Thank you for your business!',
      lineItemsHtml: '<table style="width:100%;border-collapse:collapse"><tr><td style="padding:8px 0;border-bottom:1px solid #eee">Managed Services — Monthly</td><td style="text-align:right;padding:8px 0;border-bottom:1px solid #eee">$2,000.00</td></tr><tr><td style="padding:8px 0;border-bottom:1px solid #eee">M365 Business Basic x25</td><td style="text-align:right;padding:8px 0;border-bottom:1px solid #eee">$500.00</td></tr></table>',
      quoteFooter: s.quoteFooter || 'This quote is valid for 30 days.',
      // Portal
      portalUrl: 'https://portal.yourcompany.com',
    };

    return {
      subject: renderTemplate(subjectToRender, sampleVars),
      bodyHtml: renderTemplate(htmlToRender, sampleVars),
    };
  });

  // ===== SLA POLICIES =====

  fastify.get('/api/v1/settings/sla-policies', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    return fastify.db.select().from(slaPolicies)
      .where(and(eq(slaPolicies.tenantId, request.tenantId), eq(slaPolicies.isActive, true)))
      .orderBy(slaPolicies.name);
  });

  fastify.post('/api/v1/settings/sla-policies', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as any;
    const [policy] = await fastify.db.insert(slaPolicies).values({
      tenantId: request.tenantId, ...body,
    }).returning();
    reply.code(201);
    return policy;
  });

  fastify.patch('/api/v1/settings/sla-policies/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const [updated] = await fastify.db.update(slaPolicies)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(slaPolicies.id, id), eq(slaPolicies.tenantId, request.tenantId))).returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/sla-policies/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.update(slaPolicies)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(slaPolicies.id, id), eq(slaPolicies.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  fastify.post('/api/v1/settings/sla-policies/seed-defaults', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const existing = await fastify.db.select().from(slaPolicies)
      .where(eq(slaPolicies.tenantId, request.tenantId));
    if (existing.length > 0) return { created: 0, message: 'SLA policies already exist' };

    await fastify.db.insert(slaPolicies).values([
      {
        tenantId: request.tenantId, name: 'Standard', description: 'Standard SLA for most customers', isDefault: true,
        criticalResponseMinutes: 60, criticalResolutionMinutes: 240,
        highResponseMinutes: 240, highResolutionMinutes: 480,
        mediumResponseMinutes: 480, mediumResolutionMinutes: 1440,
        lowResponseMinutes: 1440, lowResolutionMinutes: 2880,
      },
      {
        tenantId: request.tenantId, name: 'Premium', description: 'Premium SLA for priority customers', isDefault: false,
        criticalResponseMinutes: 30, criticalResolutionMinutes: 120,
        highResponseMinutes: 60, highResolutionMinutes: 240,
        mediumResponseMinutes: 240, mediumResolutionMinutes: 480,
        lowResponseMinutes: 480, lowResolutionMinutes: 1440,
      },
    ]);
    return { created: 2 };
  });

  // ===== DASHBOARD STATS (company-wide) =====

  fastify.get('/api/v1/dashboard/stats', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const tid = request.tenantId;

    // Parallel fetch all data
    const [
      customerCount,
      ticketCounts,
      invoiceData,
      contractData,
      timeData,
    ] = await Promise.all([
      // Customer count
      fastify.db.select({ count: sql<number>`count(*)::int` }).from(customers)
        .where(eq(customers.tenantId, tid)),
      // Ticket counts by status
      fastify.db.select().from(tickets).where(eq(tickets.tenantId, tid)),
      // Invoice data
      fastify.db.select().from(invoices).where(eq(invoices.tenantId, tid)),
      // Contract line items (for revenue/cost)
      fastify.db.select({
        contractId: contractLineItems.contractId,
        unitPriceCents: contractLineItems.unitPriceCents,
        unitCostCents: contractLineItems.unitCostCents,
        quantity: contractLineItems.quantity,
      }).from(contractLineItems)
        .innerJoin(contracts, eq(contractLineItems.contractId, contracts.id))
        .where(and(eq(contracts.tenantId, tid), eq(contracts.status, 'active'))),
      // Time entries
      fastify.db.select({
        durationMinutes: ticketTimeEntries.durationMinutes,
        isBillable: ticketTimeEntries.isBillable,
        isBilled: ticketTimeEntries.isBilled,
        rateCents: ticketTimeEntries.rateCents,
        userId: ticketTimeEntries.userId,
      }).from(ticketTimeEntries).where(eq(ticketTimeEntries.tenantId, tid)),
    ]);

    // Customer stats
    const totalCustomers = customerCount[0]?.count ?? 0;

    // Ticket stats
    const openTickets = ticketCounts.filter(t => !['resolved', 'closed'].includes(t.status)).length;
    const criticalTickets = ticketCounts.filter(t => t.priority === 'critical' && !['resolved', 'closed'].includes(t.status)).length;
    const newTickets = ticketCounts.filter(t => t.status === 'new').length;
    const slaBreached = ticketCounts.filter(t => t.slaBreached === true).length;

    // Invoice stats
    const openInvoices = invoiceData.filter(i => ['sent', 'partial'].includes(i.status)).length;
    const overdueInvoices = invoiceData.filter(i => {
      if (i.status !== 'sent') return false;
      return i.dueDate < new Date().toISOString().split('T')[0];
    }).length;
    const totalOutstandingCents = invoiceData
      .filter(i => ['sent', 'partial', 'overdue'].includes(i.status))
      .reduce((s, i) => s + (i.totalCents - i.amountPaidCents), 0);
    const totalPaidThisMonth = invoiceData
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + i.amountPaidCents, 0);

    // Contract P&L (company-wide from active contracts)
    let totalRevenueCents = 0;
    let totalProductCostCents = 0;
    for (const li of contractData) {
      const qty = parseFloat(li.quantity ?? '1');
      totalRevenueCents += Math.round(li.unitPriceCents * qty);
      if (li.unitCostCents) totalProductCostCents += Math.round(li.unitCostCents * qty);
    }

    // Labor costs
    const [tenant] = await fastify.db.select({ defaultCost: tenants.defaultInternalCostCents })
      .from(tenants).where(eq(tenants.id, tid)).limit(1);
    const defaultCost = tenant?.defaultCost ?? 7500;

    // Get per-tech costs
    const techUsers = await fastify.db.select({ id: users.id, internalCostCents: users.internalCostCents })
      .from(users).where(eq(users.tenantId, tid));
    const techCostMap = new Map(techUsers.map(u => [u.id, u.internalCostCents ?? defaultCost]));

    let totalLaborCostCents = 0;
    let totalLaborMinutes = 0;
    let unbilledMinutes = 0;
    for (const te of timeData) {
      const mins = te.durationMinutes ?? 0;
      totalLaborMinutes += mins;
      const costRate = techCostMap.get(te.userId) ?? defaultCost;
      totalLaborCostCents += Math.round((mins / 60) * costRate);
      if (te.isBillable && !te.isBilled) unbilledMinutes += mins;
    }

    const totalCostCents = totalProductCostCents + totalLaborCostCents;
    const trueProfitCents = totalRevenueCents - totalCostCents;
    const trueMarginPercent = totalRevenueCents > 0 ? Math.round((trueProfitCents / totalRevenueCents) * 1000) / 10 : 0;

    return {
      customers: { total: totalCustomers },
      tickets: { open: openTickets, critical: criticalTickets, new: newTickets, slaBreached },
      invoices: { open: openInvoices, overdue: overdueInvoices, outstandingCents: totalOutstandingCents, paidThisMonthCents: totalPaidThisMonth },
      contracts: {
        monthlyRevenueCents: totalRevenueCents,
        productCostCents: totalProductCostCents,
        laborCostCents: totalLaborCostCents,
        totalCostCents,
        trueProfitCents,
        trueMarginPercent,
      },
      labor: {
        totalHours: Math.round((totalLaborMinutes / 60) * 10) / 10,
        unbilledHours: Math.round((unbilledMinutes / 60) * 10) / 10,
      },
    };
  });

  // ===== TAX RATES =====

  fastify.get('/api/v1/settings/tax-rates', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { asc } = await import('drizzle-orm');
    return fastify.db.select().from(taxRates)
      .where(eq(taxRates.tenantId, request.tenantId))
      .orderBy(asc(taxRates.state), asc(taxRates.county));
  });

  fastify.post('/api/v1/settings/tax-rates', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as {
      state: string; county?: string; combinedRate: string;
      stateRate?: string; countyRate?: string;
      appliesToProducts?: boolean; appliesToServices?: boolean;
    };
    const [rate] = await fastify.db.insert(taxRates).values({
      tenantId: request.tenantId,
      state: body.state.toUpperCase(),
      county: body.county?.trim() || null,
      combinedRate: body.combinedRate,
      stateRate: body.stateRate || null,
      countyRate: body.countyRate || null,
      appliesToProducts: body.appliesToProducts ?? true,
      appliesToServices: body.appliesToServices ?? false,
    }).returning();
    reply.code(201);
    return rate;
  });

  fastify.patch('/api/v1/settings/tax-rates/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{
      state: string; county: string; combinedRate: string;
      stateRate: string; countyRate: string;
      appliesToProducts: boolean; appliesToServices: boolean; isActive: boolean;
    }>;
    const update: Record<string, unknown> = { updatedAt: new Date() };
    if (body.state !== undefined) update.state = body.state.toUpperCase();
    if (body.county !== undefined) update.county = body.county.trim() || null;
    if (body.combinedRate !== undefined) update.combinedRate = body.combinedRate;
    if (body.stateRate !== undefined) update.stateRate = body.stateRate;
    if (body.countyRate !== undefined) update.countyRate = body.countyRate;
    if (body.appliesToProducts !== undefined) update.appliesToProducts = body.appliesToProducts;
    if (body.appliesToServices !== undefined) update.appliesToServices = body.appliesToServices;
    if (body.isActive !== undefined) update.isActive = body.isActive;
    const [updated] = await fastify.db.update(taxRates).set(update)
      .where(and(eq(taxRates.id, id), eq(taxRates.tenantId, request.tenantId))).returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/tax-rates/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(taxRates)
      .where(and(eq(taxRates.id, id), eq(taxRates.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // Seed SC and NC county tax rates
  fastify.post('/api/v1/settings/tax-rates/seed', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { getSCNCTaxRates } = await import('../../services/tax-seed.js');
    const rates = getSCNCTaxRates();
    let created = 0;
    for (const r of rates) {
      try {
        await fastify.db.insert(taxRates).values({ tenantId: request.tenantId, ...r });
        created++;
      } catch { /* skip duplicates */ }
    }
    return { created, total: rates.length };
  });

  // Lookup tax rate for a customer (by their billing address)
  fastify.get('/api/v1/settings/tax-rates/lookup/:customerId', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { customerId } = request.params as { customerId: string };
    const [customer] = await fastify.db.select().from(customers)
      .where(and(eq(customers.id, customerId), eq(customers.tenantId, request.tenantId))).limit(1);
    if (!customer?.state) return { rate: null, message: 'Customer has no state set' };

    // Try county match first, then state-level default
    const { ilike } = await import('drizzle-orm');
    let [rate] = await fastify.db.select().from(taxRates)
      .where(and(
        eq(taxRates.tenantId, request.tenantId),
        eq(taxRates.state, customer.state.toUpperCase()),
        customer.city ? ilike(taxRates.county, customer.city) : sql`false`,
        eq(taxRates.isActive, true),
      )).limit(1);

    // Fallback: state-level (county is null)
    if (!rate) {
      [rate] = await fastify.db.select().from(taxRates)
        .where(and(
          eq(taxRates.tenantId, request.tenantId),
          eq(taxRates.state, customer.state.toUpperCase()),
          sql`${taxRates.county} IS NULL`,
          eq(taxRates.isActive, true),
        )).limit(1);
    }

    return { rate: rate || null };
  });
}
