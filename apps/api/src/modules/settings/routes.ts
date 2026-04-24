import { FastifyInstance } from 'fastify';
import { eq, and, sql, desc, count } from 'drizzle-orm';
import { tenantSequences, integrationConfigs, tenants, users, emailTemplates, slaPolicies, customers, contracts, contractLineItems, invoices, tickets, ticketTimeEntries, taxRates, auditLog, customFieldDefinitions, customFieldValues, ticketQueues, ticketTags, ticketTagAssignments, ticketCategories, ticketSubcategories, recurringTicketRules, workflowRules, businessDocuments } from '@rivertown/db';
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

  // ===== AUDIT LOG =====

  fastify.get('/api/v1/settings/audit-log', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { page = '1', limit = '50', action, entityType } = request.query as Record<string, string>;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const conditions: any[] = [eq(auditLog.tenantId, request.tenantId)];
    if (action) conditions.push(eq(auditLog.action, action));
    if (entityType) conditions.push(eq(auditLog.entityType, entityType));

    const [data, [{ total }]] = await Promise.all([
      fastify.db.select().from(auditLog).where(and(...conditions))
        .orderBy(desc(auditLog.createdAt)).limit(parseInt(limit)).offset(offset),
      fastify.db.select({ total: count() }).from(auditLog).where(and(...conditions)),
    ]);

    // Resolve actor names
    const actorIds = [...new Set(data.map(d => d.actorId))];
    const actorMap = new Map<string, string>();
    if (actorIds.length > 0) {
      for (const id of actorIds) {
        const [u] = await fastify.db.select({ displayName: users.displayName, email: users.email })
          .from(users).where(eq(users.id, id)).limit(1);
        if (u) actorMap.set(id, u.displayName || u.email);
      }
    }

    const enriched = data.map(d => ({
      ...d,
      actorName: actorMap.get(d.actorId) || d.actorId,
    }));

    return {
      data: enriched,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: Number(total),
        totalPages: Math.ceil(Number(total) / parseInt(limit)),
      },
    };
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

  // ===== AI ASSISTANT =====

  fastify.get(
    '/api/v1/settings/ai',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ai')))
        .limit(1);

      if (!config) {
        return { isEnabled: false, apiKey: '', model: 'claude-sonnet-4-20250514', provider: 'anthropic', personality: '', name: 'Atlas' };
      }

      const creds = readCredentials(config.credentials);
      const settings = (config.settings ?? {}) as Record<string, string>;
      return {
        isEnabled: config.isEnabled,
        apiKey: creds.apiKey ? '••••••••' + String(creds.apiKey).slice(-4) : '',
        model: settings.model || 'claude-sonnet-4-20250514',
        provider: settings.provider || 'anthropic',
        personality: settings.personality || '',
        name: settings.name || 'Atlas',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/ai',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials, writeCredentials } = await import('../../common/credentials.js');
      const body = request.body as { isEnabled: boolean; apiKey?: string; model?: string; provider?: string; personality?: string; name?: string };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ai')))
        .limit(1);

      const prevCreds = existing ? readCredentials(existing.credentials) : {};
      const prevSettings = (existing?.settings ?? {}) as Record<string, string>;

      const credentials = writeCredentials({
        apiKey: body.apiKey?.startsWith('••') ? prevCreds.apiKey : (body.apiKey || prevCreds.apiKey || ''),
      });

      const settings = {
        ...prevSettings,
        model: body.model || prevSettings.model || 'claude-sonnet-4-20250514',
        provider: body.provider || prevSettings.provider || 'anthropic',
        personality: body.personality ?? prevSettings.personality ?? '',
        name: body.name || prevSettings.name || 'Atlas',
      };

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, settings, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'ai',
          isEnabled: body.isEnabled, credentials, settings,
        });
      }

      return { success: true };
    },
  );

  fastify.post(
    '/api/v1/settings/ai/test',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ai')))
        .limit(1);

      const creds = config ? readCredentials(config.credentials) : {};
      const settings = (config?.settings ?? {}) as Record<string, string>;
      const apiKey = (creds.apiKey as string) || process.env.ANTHROPIC_API_KEY || '';
      const provider = settings.provider || 'anthropic';
      const model = settings.model || 'claude-sonnet-4-20250514';
      if (!apiKey) throw new ValidationError('No API key configured');

      try {
        if (provider === 'openai') {
          const res = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model, max_tokens: 50, messages: [{ role: 'user', content: 'Reply with "AI connection successful" and nothing else.' }] }),
          });
          if (!res.ok) {
            const err = await res.text();
            return { success: false, message: `OpenAI error (${res.status}): ${err.substring(0, 200)}` };
          }
          const data = await res.json() as any;
          return { success: true, message: data.choices?.[0]?.message?.content ?? 'Connected' };
        } else {
          const Anthropic = (await import('@anthropic-ai/sdk')).default;
          const client = new Anthropic({ apiKey });
          const response = await client.messages.create({
            model, max_tokens: 50,
            messages: [{ role: 'user', content: 'Reply with "AI connection successful" and nothing else.' }],
          });
          const text = response.content[0];
          return { success: true, message: text.type === 'text' ? text.text : 'Connected' };
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Connection failed';
        return { success: false, message: msg };
      }
    },
  );

  // ===== CONNECTBOOSTER (MSP Payment Processor) =====

  fastify.get(
    '/api/v1/settings/connectbooster',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'connectbooster')))
        .limit(1);
      if (!config) return { isEnabled: false, apiKey: '', merchantId: '' };
      const creds = readCredentials(config.credentials) as Record<string, string>;
      return {
        isEnabled: config.isEnabled,
        apiKey: creds.apiKey ? '••••••••' + String(creds.apiKey).slice(-4) : '',
        merchantId: creds.merchantId || '',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/connectbooster',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials, writeCredentials } = await import('../../common/credentials.js');
      const body = request.body as { isEnabled: boolean; apiKey?: string; merchantId?: string };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'connectbooster')))
        .limit(1);

      const prevCreds = existing ? (readCredentials(existing.credentials) as Record<string, string>) : {};
      const credentials = writeCredentials({
        apiKey: body.apiKey?.startsWith('••') ? prevCreds.apiKey : (body.apiKey || prevCreds.apiKey || ''),
        merchantId: body.merchantId || prevCreds.merchantId || '',
      });

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'connectbooster',
          isEnabled: body.isEnabled, credentials,
        });
      }
      return { success: true };
    },
  );

  // ===== QBO PAYMENTS =====
  // QuickBooks Payments uses the same OAuth tokens as QBO itself.
  // This setting just flags whether the tenant wants to use QBO Payments for invoice payment links.

  fastify.get(
    '/api/v1/settings/qbo-payments',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'qbo_payments')))
        .limit(1);
      const [qbo] = await fastify.db.select({ isEnabled: integrationConfigs.isEnabled }).from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'quickbooks')))
        .limit(1);
      return {
        isEnabled: config?.isEnabled ?? false,
        qboConnected: qbo?.isEnabled ?? false,
      };
    },
  );

  fastify.put(
    '/api/v1/settings/qbo-payments',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const body = request.body as { isEnabled: boolean };
      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'qbo_payments')))
        .limit(1);

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'qbo_payments',
          isEnabled: body.isEnabled, credentials: {},
        });
      }
      return { success: true };
    },
  );

  // ===== CREWHU (CSAT) =====

  fastify.get(
    '/api/v1/settings/crewhu',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'crewhu')))
        .limit(1);
      if (!config) return { isEnabled: false, apiKey: '' };
      const creds = readCredentials(config.credentials) as Record<string, string>;
      return {
        isEnabled: config.isEnabled,
        apiKey: creds.apiKey ? '••••••••' + String(creds.apiKey).slice(-4) : '',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/crewhu',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials, writeCredentials } = await import('../../common/credentials.js');
      const body = request.body as { isEnabled: boolean; apiKey?: string };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'crewhu')))
        .limit(1);

      const prevCreds = existing ? (readCredentials(existing.credentials) as Record<string, string>) : {};
      const credentials = writeCredentials({
        apiKey: body.apiKey?.startsWith('••') ? prevCreds.apiKey : (body.apiKey || prevCreds.apiKey || ''),
      });

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'crewhu',
          isEnabled: body.isEnabled, credentials,
        });
      }
      return { success: true };
    },
  );

  // ===== NINJAONE (RMM) =====

  fastify.get(
    '/api/v1/settings/ninjaone',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ninjaone')))
        .limit(1);
      if (!config) return { isEnabled: false, clientId: '', clientSecret: '', region: 'us' };
      const creds = readCredentials(config.credentials) as Record<string, string>;
      const settings = (config.settings ?? {}) as Record<string, string>;
      return {
        isEnabled: config.isEnabled,
        clientId: creds.clientId ? '••••••••' + String(creds.clientId).slice(-4) : '',
        clientSecret: creds.clientSecret ? '••••••••' : '',
        region: settings.region || 'us',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/ninjaone',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials, writeCredentials } = await import('../../common/credentials.js');
      const body = request.body as { isEnabled: boolean; clientId?: string; clientSecret?: string; region?: string };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ninjaone')))
        .limit(1);

      const prevCreds = existing ? (readCredentials(existing.credentials) as Record<string, string>) : {};
      const credentials = writeCredentials({
        clientId: body.clientId?.startsWith('••') ? prevCreds.clientId : (body.clientId || prevCreds.clientId || ''),
        clientSecret: body.clientSecret?.startsWith('••') ? prevCreds.clientSecret : (body.clientSecret || prevCreds.clientSecret || ''),
      });
      const settings = { region: body.region || 'us' };

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, settings, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'ninjaone',
          isEnabled: body.isEnabled, credentials, settings,
        });
      }
      return { success: true };
    },
  );

  // ===== SCREENCONNECT (RMM) =====

  fastify.get(
    '/api/v1/settings/screenconnect',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'screenconnect')))
        .limit(1);
      if (!config) return { isEnabled: false, serverUrl: '', username: '', password: '', totpSecret: '', syncFrequency: '15min', companyProperty: 'CustomProperty1', lastSyncAt: null, syncStatus: 'idle' };
      const creds = readCredentials(config.credentials) as Record<string, string>;
      const settings = (config.settings ?? {}) as Record<string, string>;
      return {
        isEnabled: config.isEnabled,
        serverUrl: settings.serverUrl || '',
        username: creds.username || '',
        password: creds.password ? '••••••••' : '',
        totpSecret: creds.totpSecret ? '••••••••' : '',
        syncFrequency: settings.syncFrequency || '15min',
        companyProperty: settings.companyProperty || 'CustomProperty1',
        lastSyncAt: config.lastSyncAt,
        syncStatus: config.syncStatus || 'idle',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/screenconnect',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials, writeCredentials } = await import('../../common/credentials.js');
      const body = request.body as { isEnabled: boolean; serverUrl?: string; username?: string; password?: string; totpSecret?: string; syncFrequency?: string; companyProperty?: string };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'screenconnect')))
        .limit(1);

      const prevCreds = existing ? (readCredentials(existing.credentials) as Record<string, string>) : {};
      const prevSettings = (existing?.settings ?? {}) as Record<string, string>;

      const credentials = writeCredentials({
        username: body.username || prevCreds.username || '',
        password: body.password?.startsWith('••') ? prevCreds.password : (body.password || prevCreds.password || ''),
        totpSecret: body.totpSecret?.startsWith('••') ? prevCreds.totpSecret : (body.totpSecret || prevCreds.totpSecret || ''),
      });

      const settings = {
        serverUrl: body.serverUrl || prevSettings.serverUrl || '',
        syncFrequency: body.syncFrequency || prevSettings.syncFrequency || '15min',
        companyProperty: body.companyProperty || prevSettings.companyProperty || 'CustomProperty1',
      };

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, settings, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'screenconnect',
          isEnabled: body.isEnabled, credentials, settings,
        });
      }
      return { success: true };
    },
  );

  fastify.post(
    '/api/v1/settings/screenconnect/test',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'screenconnect')))
        .limit(1);

      if (!config) throw new ValidationError('ScreenConnect not configured');

      const creds = readCredentials(config.credentials) as Record<string, string>;
      const settings = (config.settings ?? {}) as Record<string, string>;
      const serverUrl = settings.serverUrl;
      const { username, password, totpSecret } = creds;

      if (!serverUrl || !username || !password || !totpSecret) {
        throw new ValidationError('Server URL, username, password, and TOTP secret are all required');
      }

      try {
        const { fetchScreenConnectSessionsForTest } = await import('../../services/screenconnect-sync.js');
        const sessions = await fetchScreenConnectSessionsForTest(serverUrl, username, password, totpSecret);
        return { success: true, sessionCount: sessions.length };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        return { success: false, error: message };
      }
    },
  );

  // ===== N-CENTRAL (RMM) =====

  fastify.get(
    '/api/v1/settings/ncentral',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ncentral')))
        .limit(1);
      if (!config) return { isEnabled: false, serverUrl: '', jwtToken: '', syncFrequency: 'hourly', lastSyncAt: null, syncStatus: 'idle' };
      const creds = readCredentials(config.credentials) as Record<string, string>;
      const settings = (config.settings ?? {}) as Record<string, string>;
      return {
        isEnabled: config.isEnabled,
        serverUrl: settings.serverUrl || '',
        jwtToken: creds.jwtToken ? '••••••••' + String(creds.jwtToken).slice(-4) : '',
        syncFrequency: settings.syncFrequency || 'hourly',
        lastSyncAt: config.lastSyncAt,
        syncStatus: config.syncStatus || 'idle',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/ncentral',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials, writeCredentials } = await import('../../common/credentials.js');
      const body = request.body as { isEnabled: boolean; serverUrl?: string; jwtToken?: string; syncFrequency?: string };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ncentral')))
        .limit(1);

      const prevCreds = existing ? (readCredentials(existing.credentials) as Record<string, string>) : {};
      const prevSettings = (existing?.settings ?? {}) as Record<string, string>;

      const credentials = writeCredentials({
        jwtToken: body.jwtToken?.startsWith('••') ? prevCreds.jwtToken : (body.jwtToken || prevCreds.jwtToken || ''),
      });

      const settings = {
        serverUrl: body.serverUrl || prevSettings.serverUrl || '',
        syncFrequency: body.syncFrequency || prevSettings.syncFrequency || 'hourly',
      };

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, settings, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'ncentral',
          isEnabled: body.isEnabled, credentials, settings,
        });
      }
      return { success: true };
    },
  );

  fastify.post(
    '/api/v1/settings/ncentral/test',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'ncentral')))
        .limit(1);

      if (!config) throw new ValidationError('N-central not configured');

      const creds = readCredentials(config.credentials) as Record<string, string>;
      const settings = (config.settings ?? {}) as Record<string, string>;
      const serverUrl = settings.serverUrl;
      const jwtToken = creds.jwtToken;

      if (!serverUrl || !jwtToken) {
        throw new ValidationError('Server URL and JWT token are required');
      }

      try {
        const { fetchNCentralDevicesForTest } = await import('../../services/ncentral-sync.js');
        const devices = await fetchNCentralDevicesForTest(serverUrl, jwtToken);
        return { success: true, deviceCount: devices.length };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Connection failed';
        return { success: false, error: message };
      }
    },
  );

  // ===== STORAGE (Cloudflare R2) =====

  fastify.get(
    '/api/v1/settings/storage',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'storage')))
        .limit(1);
      if (!config) return { isEnabled: false, accountId: '', accessKeyId: '', secretAccessKey: '', bucketName: 'rivertown-psa' };
      const creds = readCredentials(config.credentials) as Record<string, string>;
      const settings = (config.settings ?? {}) as Record<string, string>;
      return {
        isEnabled: config.isEnabled,
        accountId: settings.accountId || '',
        accessKeyId: creds.accessKeyId ? '••••••••' + String(creds.accessKeyId).slice(-4) : '',
        secretAccessKey: creds.secretAccessKey ? '••••••••' : '',
        bucketName: settings.bucketName || 'rivertown-psa',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/storage',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials, writeCredentials } = await import('../../common/credentials.js');
      const body = request.body as { isEnabled: boolean; accountId?: string; accessKeyId?: string; secretAccessKey?: string; bucketName?: string };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'storage')))
        .limit(1);

      const prevCreds = existing ? (readCredentials(existing.credentials) as Record<string, string>) : {};
      const prevSettings = (existing?.settings ?? {}) as Record<string, string>;

      const credentials = writeCredentials({
        accessKeyId: body.accessKeyId?.startsWith('••') ? prevCreds.accessKeyId : (body.accessKeyId || prevCreds.accessKeyId || ''),
        secretAccessKey: body.secretAccessKey?.startsWith('••') ? prevCreds.secretAccessKey : (body.secretAccessKey || prevCreds.secretAccessKey || ''),
      });

      const settings = {
        accountId: body.accountId || prevSettings.accountId || '',
        bucketName: body.bucketName || prevSettings.bucketName || 'rivertown-psa',
      };

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, settings, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'storage',
          isEnabled: body.isEnabled, credentials, settings,
        });
      }
      return { success: true };
    },
  );

  fastify.post(
    '/api/v1/settings/storage/test',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { testR2Connection } = await import('../../services/r2-storage.js');
      const result = await testR2Connection(fastify.db, request.tenantId);
      if (!result.success) {
        return { success: false, error: result.error || 'Connection failed' };
      }
      return { success: true };
    },
  );

  // ===== TWILIO (SMS MFA) =====

  fastify.get(
    '/api/v1/settings/twilio',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials } = await import('../../common/credentials.js');
      const [config] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'twilio')))
        .limit(1);

      if (!config) {
        return { isEnabled: false, accountSid: '', authToken: '', fromNumber: '' };
      }

      const creds = readCredentials(config.credentials) as Record<string, string>;
      return {
        isEnabled: config.isEnabled,
        accountSid: creds.accountSid ? '••••••••' + String(creds.accountSid).slice(-4) : '',
        authToken: creds.authToken ? '••••••••' : '',
        fromNumber: creds.fromNumber || '',
      };
    },
  );

  fastify.put(
    '/api/v1/settings/twilio',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { readCredentials, writeCredentials } = await import('../../common/credentials.js');
      const body = request.body as { isEnabled: boolean; accountSid?: string; authToken?: string; fromNumber?: string };

      const [existing] = await fastify.db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'twilio')))
        .limit(1);

      const prevCreds = existing ? (readCredentials(existing.credentials) as Record<string, string>) : {};

      const credentials = writeCredentials({
        accountSid: body.accountSid?.startsWith('••') ? prevCreds.accountSid : (body.accountSid || prevCreds.accountSid || ''),
        authToken: body.authToken?.startsWith('••') ? prevCreds.authToken : (body.authToken || prevCreds.authToken || ''),
        fromNumber: body.fromNumber || prevCreds.fromNumber || '',
      });

      if (existing) {
        await fastify.db.update(integrationConfigs).set({
          isEnabled: body.isEnabled, credentials, updatedAt: new Date(),
        }).where(eq(integrationConfigs.id, existing.id));
      } else {
        await fastify.db.insert(integrationConfigs).values({
          tenantId: request.tenantId, provider: 'twilio',
          isEnabled: body.isEnabled, credentials,
        });
      }

      return { success: true };
    },
  );

  fastify.post(
    '/api/v1/settings/twilio/test',
    { preHandler: [fastify.authenticate, requirePermission('*')] },
    async (request) => {
      const { sendSms } = await import('../../services/sms.js');
      const { phone } = request.body as { phone: string };
      if (!phone) throw new ValidationError('Phone number required');

      const digits = phone.replace(/\D/g, '');
      const e164 = digits.startsWith('1') ? `+${digits}` : `+1${digits}`;

      const result = await sendSms(
        { to: e164, message: 'Rivertown Technology test: SMS is working!' },
        fastify.db, request.tenantId,
      );

      if (!result.success) throw new ValidationError(result.error || 'SMS test failed');
      return { success: true, message: `Test SMS sent to ${e164}` };
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

  // ===== TICKET AUTOMATION =====

  fastify.get('/api/v1/settings/ticket-automation', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const [tenant] = await fastify.db.select().from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    return {
      ticketAutoCloseResolvedEnabled: settings.ticketAutoCloseResolvedEnabled ?? false,
      ticketAutoCloseResolvedDays: settings.ticketAutoCloseResolvedDays ?? 3,
      ticketAutoCloseWaitingEnabled: settings.ticketAutoCloseWaitingEnabled ?? false,
      ticketAutoCloseWaitingDays: settings.ticketAutoCloseWaitingDays ?? 7,
      ticketAutoReopenOnReply: settings.ticketAutoReopenOnReply ?? true,
      ticketSlaPauseOnWaiting: settings.ticketSlaPauseOnWaiting ?? true,
    };
  });

  fastify.put('/api/v1/settings/ticket-automation', {
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

  // ===== CUSTOM FIELD DEFINITIONS =====

  fastify.get('/api/v1/settings/custom-fields', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { entityType } = request.query as { entityType?: string };
    const conditions = [eq(customFieldDefinitions.tenantId, request.tenantId)];
    if (entityType) conditions.push(eq(customFieldDefinitions.entityType, entityType));
    return fastify.db.select().from(customFieldDefinitions).where(and(...conditions)).orderBy(customFieldDefinitions.sortOrder);
  });

  fastify.post('/api/v1/settings/custom-fields', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as { entityType: string; fieldName: string; fieldLabel: string; fieldType: string; options?: unknown; required?: boolean };
    const [field] = await fastify.db.insert(customFieldDefinitions).values({
      tenantId: request.tenantId, ...body,
    }).returning();
    reply.code(201);
    return field;
  });

  fastify.patch('/api/v1/settings/custom-fields/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [updated] = await fastify.db.update(customFieldDefinitions).set({ ...body })
      .where(and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.tenantId, request.tenantId))).returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/custom-fields/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(customFieldValues).where(eq(customFieldValues.definitionId, id));
    await fastify.db.delete(customFieldDefinitions)
      .where(and(eq(customFieldDefinitions.id, id), eq(customFieldDefinitions.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== CUSTOM FIELD VALUES (for reading/writing on entities) =====

  fastify.get('/api/v1/custom-fields/:entityType/:entityId', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    const defs = await fastify.db.select().from(customFieldDefinitions)
      .where(and(eq(customFieldDefinitions.tenantId, request.tenantId), eq(customFieldDefinitions.entityType, entityType)))
      .orderBy(customFieldDefinitions.sortOrder);
    const vals = await fastify.db.select().from(customFieldValues)
      .where(and(eq(customFieldValues.tenantId, request.tenantId), eq(customFieldValues.entityId, entityId)));
    const valueMap = new Map(vals.map(v => [v.definitionId, v.value]));
    return defs.map(d => ({ ...d, value: valueMap.get(d.id) ?? null }));
  });

  fastify.put('/api/v1/custom-fields/:entityType/:entityId', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const { entityType, entityId } = request.params as { entityType: string; entityId: string };
    const body = request.body as Record<string, string | null>;
    for (const [defId, value] of Object.entries(body)) {
      const existing = await fastify.db.select().from(customFieldValues)
        .where(and(eq(customFieldValues.definitionId, defId), eq(customFieldValues.entityId, entityId))).limit(1);
      if (existing.length) {
        await fastify.db.update(customFieldValues).set({ value, updatedAt: new Date() })
          .where(and(eq(customFieldValues.definitionId, defId), eq(customFieldValues.entityId, entityId)));
      } else {
        await fastify.db.insert(customFieldValues).values({ tenantId: request.tenantId, definitionId: defId, entityId, value });
      }
    }
    return { success: true };
  });

  // ===== TICKET TEMPLATES (stored in tenant settings JSONB) =====

  fastify.get('/api/v1/settings/ticket-templates', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const [tenant] = await fastify.db.select({ settings: tenants.settings }).from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const settings = (tenant?.settings ?? {}) as Record<string, unknown>;
    return (settings.ticketTemplates as any[]) ?? [];
  });

  fastify.put('/api/v1/settings/ticket-templates', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const templates = request.body as any[];
    const [tenant] = await fastify.db.select({ settings: tenants.settings }).from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const settings = { ...((tenant?.settings ?? {}) as Record<string, unknown>), ticketTemplates: templates };
    await fastify.db.update(tenants).set({ settings, updatedAt: new Date() }).where(eq(tenants.id, request.tenantId));
    return { success: true };
  });

  // ===== TICKET QUEUES =====

  fastify.get('/api/v1/settings/ticket-queues', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    return fastify.db.select().from(ticketQueues)
      .where(eq(ticketQueues.tenantId, request.tenantId))
      .orderBy(ticketQueues.sortOrder);
  });

  fastify.post('/api/v1/settings/ticket-queues', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as { name: string; description?: string; color?: string; isDefault?: boolean; sortOrder?: number };
    const [queue] = await fastify.db.insert(ticketQueues).values({
      tenantId: request.tenantId,
      name: body.name,
      description: body.description,
      color: body.color,
      isDefault: body.isDefault ?? false,
      sortOrder: body.sortOrder ?? 0,
    }).returning();
    reply.code(201);
    return queue;
  });

  fastify.patch('/api/v1/settings/ticket-queues/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{ name: string; description: string; color: string; isDefault: boolean; sortOrder: number }>;
    const [updated] = await fastify.db.update(ticketQueues)
      .set(body)
      .where(and(eq(ticketQueues.id, id), eq(ticketQueues.tenantId, request.tenantId)))
      .returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/ticket-queues/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Unlink tickets from this queue first
    await fastify.db.update(tickets).set({ queueId: null, updatedAt: new Date() })
      .where(and(eq(tickets.queueId, id), eq(tickets.tenantId, request.tenantId)));
    await fastify.db.delete(ticketQueues)
      .where(and(eq(ticketQueues.id, id), eq(ticketQueues.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== TICKET TAGS =====

  fastify.get('/api/v1/settings/ticket-tags', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    return fastify.db.select().from(ticketTags)
      .where(eq(ticketTags.tenantId, request.tenantId))
      .orderBy(ticketTags.name);
  });

  fastify.post('/api/v1/settings/ticket-tags', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as { name: string; color?: string };
    const [tag] = await fastify.db.insert(ticketTags).values({
      tenantId: request.tenantId,
      name: body.name,
      color: body.color,
    }).returning();
    reply.code(201);
    return tag;
  });

  fastify.patch('/api/v1/settings/ticket-tags/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{ name: string; color: string }>;
    const [updated] = await fastify.db.update(ticketTags)
      .set(body)
      .where(and(eq(ticketTags.id, id), eq(ticketTags.tenantId, request.tenantId)))
      .returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/ticket-tags/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Delete tag assignments first
    await fastify.db.delete(ticketTagAssignments).where(eq(ticketTagAssignments.tagId, id));
    await fastify.db.delete(ticketTags)
      .where(and(eq(ticketTags.id, id), eq(ticketTags.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== TICKET CATEGORIES =====

  fastify.post('/api/v1/settings/ticket-categories', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as { name: string; description?: string; sortOrder?: number };
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const [category] = await fastify.db.insert(ticketCategories).values({
      tenantId: request.tenantId,
      name: body.name,
      slug,
      description: body.description,
      sortOrder: body.sortOrder ?? 0,
    }).returning();
    reply.code(201);
    return category;
  });

  fastify.patch('/api/v1/settings/ticket-categories/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{ name: string; description: string; sortOrder: number; isActive: boolean }>;
    const update: Record<string, unknown> = { ...body };
    if (body.name) {
      update.slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    const [updated] = await fastify.db.update(ticketCategories)
      .set(update)
      .where(and(eq(ticketCategories.id, id), eq(ticketCategories.tenantId, request.tenantId)))
      .returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/ticket-categories/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Unlink tickets from this category
    await fastify.db.update(tickets).set({ categoryId: null, subcategoryId: null, updatedAt: new Date() })
      .where(and(eq(tickets.categoryId, id), eq(tickets.tenantId, request.tenantId)));
    // Delete subcategories under this category
    await fastify.db.delete(ticketSubcategories)
      .where(and(eq(ticketSubcategories.categoryId, id), eq(ticketSubcategories.tenantId, request.tenantId)));
    await fastify.db.delete(ticketCategories)
      .where(and(eq(ticketCategories.id, id), eq(ticketCategories.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== TICKET SUBCATEGORIES =====

  fastify.post('/api/v1/settings/ticket-categories/:id/subcategories', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = request.body as { name: string; description?: string; sortOrder?: number };
    const slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const [subcategory] = await fastify.db.insert(ticketSubcategories).values({
      tenantId: request.tenantId,
      categoryId: id,
      name: body.name,
      slug,
      description: body.description,
      sortOrder: body.sortOrder ?? 0,
    }).returning();
    reply.code(201);
    return subcategory;
  });

  fastify.patch('/api/v1/settings/ticket-subcategories/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Partial<{ name: string; description: string; sortOrder: number; isActive: boolean }>;
    const update: Record<string, unknown> = { ...body };
    if (body.name) {
      update.slug = body.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    }
    const [updated] = await fastify.db.update(ticketSubcategories)
      .set(update)
      .where(and(eq(ticketSubcategories.id, id), eq(ticketSubcategories.tenantId, request.tenantId)))
      .returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/ticket-subcategories/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Unlink tickets from this subcategory
    await fastify.db.update(tickets).set({ subcategoryId: null, updatedAt: new Date() })
      .where(and(eq(tickets.subcategoryId, id), eq(tickets.tenantId, request.tenantId)));
    await fastify.db.delete(ticketSubcategories)
      .where(and(eq(ticketSubcategories.id, id), eq(ticketSubcategories.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== RECURRING TICKETS =====

  fastify.get('/api/v1/settings/recurring-tickets', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const rules = await fastify.db.select().from(recurringTicketRules)
      .where(eq(recurringTicketRules.tenantId, request.tenantId))
      .orderBy(recurringTicketRules.name);
    // Enrich with customer names
    const customerIds = rules.map(r => r.customerId).filter(Boolean) as string[];
    const customerNames = new Map<string, string>();
    if (customerIds.length > 0) {
      const custs = await fastify.db.select({ id: customers.id, name: customers.name }).from(customers)
        .where(and(eq(customers.tenantId, request.tenantId)));
      for (const c of custs) customerNames.set(c.id, c.name);
    }
    return rules.map(r => ({ ...r, customerName: r.customerId ? customerNames.get(r.customerId) ?? null : null }));
  });

  fastify.post('/api/v1/settings/recurring-tickets', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as any;
    // Calculate initial nextRunAt
    const nextRunAt = calculateNextRun(body.frequency, body.dayOfWeek, body.dayOfMonth);
    const [rule] = await fastify.db.insert(recurringTicketRules).values({
      tenantId: request.tenantId,
      ...body,
      nextRunAt,
    }).returning();
    reply.code(201);
    return rule;
  });

  fastify.patch('/api/v1/settings/recurring-tickets/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const update: Record<string, unknown> = { ...body, updatedAt: new Date() };
    // Recalculate nextRunAt if schedule changed
    if (body.frequency || body.dayOfWeek !== undefined || body.dayOfMonth !== undefined) {
      const [existing] = await fastify.db.select().from(recurringTicketRules)
        .where(and(eq(recurringTicketRules.id, id), eq(recurringTicketRules.tenantId, request.tenantId))).limit(1);
      if (existing) {
        const freq = body.frequency || existing.frequency;
        const dow = body.dayOfWeek ?? existing.dayOfWeek;
        const dom = body.dayOfMonth ?? existing.dayOfMonth;
        update.nextRunAt = calculateNextRun(freq, dow, dom);
      }
    }
    const [updated] = await fastify.db.update(recurringTicketRules)
      .set(update)
      .where(and(eq(recurringTicketRules.id, id), eq(recurringTicketRules.tenantId, request.tenantId)))
      .returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/recurring-tickets/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(recurringTicketRules)
      .where(and(eq(recurringTicketRules.id, id), eq(recurringTicketRules.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== WORKFLOW RULES =====

  fastify.get('/api/v1/settings/workflow-rules', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    return fastify.db.select().from(workflowRules)
      .where(eq(workflowRules.tenantId, request.tenantId))
      .orderBy(workflowRules.sortOrder);
  });

  fastify.post('/api/v1/settings/workflow-rules', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as any;
    const [rule] = await fastify.db.insert(workflowRules).values({
      tenantId: request.tenantId, ...body,
    }).returning();
    reply.code(201);
    return rule;
  });

  fastify.patch('/api/v1/settings/workflow-rules/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as any;
    const [updated] = await fastify.db.update(workflowRules)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(workflowRules.id, id), eq(workflowRules.tenantId, request.tenantId)))
      .returning();
    return updated;
  });

  fastify.delete('/api/v1/settings/workflow-rules/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    await fastify.db.delete(workflowRules)
      .where(and(eq(workflowRules.id, id), eq(workflowRules.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // ===== REPORT TEMPLATE SETTINGS =====

  fastify.get('/api/v1/settings/report-template', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const [tenant] = await fastify.db.select({ settings: tenants.settings }).from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const s = (tenant?.settings ?? {}) as Record<string, unknown>;
    return {
      reportPrimaryColor: s.reportPrimaryColor ?? '#2563eb',
      reportAccentColor: s.reportAccentColor ?? '#3b82f6',
      reportLogoUrl: s.reportLogoUrl ?? '',
      reportCompanyName: s.reportCompanyName ?? '',
      reportFooterText: s.reportFooterText ?? '',
    };
  });

  fastify.put('/api/v1/settings/report-template', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const body = request.body as Record<string, string>;
    const [tenant] = await fastify.db.select({ settings: tenants.settings }).from(tenants)
      .where(eq(tenants.id, request.tenantId)).limit(1);
    const settings = { ...((tenant?.settings ?? {}) as Record<string, unknown>), ...body };
    await fastify.db.update(tenants).set({ settings, updatedAt: new Date() }).where(eq(tenants.id, request.tenantId));
    return { success: true };
  });

  // ===== BUSINESS DOCUMENTS =====

  // List business documents
  fastify.get('/api/v1/business-documents', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { category, search } = request.query as { category?: string; search?: string };
    const conditions: any[] = [eq(businessDocuments.tenantId, request.tenantId)];
    if (category) conditions.push(eq(businessDocuments.category, category));
    const docs = await fastify.db.select().from(businessDocuments)
      .where(and(...conditions))
      .orderBy(businessDocuments.category, businessDocuments.name)
      .limit(200);
    if (search) {
      const q = search.toLowerCase();
      return docs.filter(d => d.name.toLowerCase().includes(q) || (d.subcategory ?? '').toLowerCase().includes(q) || (d.tags ?? '').toLowerCase().includes(q));
    }
    return docs;
  });

  // Get single business document
  fastify.get('/api/v1/business-documents/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const [doc] = await fastify.db.select().from(businessDocuments)
      .where(and(eq(businessDocuments.id, id), eq(businessDocuments.tenantId, request.tenantId))).limit(1);
    if (!doc) throw new ValidationError('Document not found');
    return doc;
  });

  // Upload/create business document
  fastify.post('/api/v1/business-documents', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const data = await request.file();

    let fileName = null, fileSize = null, mimeType = null, storageKey = null;
    let metadata: Record<string, string> = {};

    if (data) {
      const buffer = await data.toBuffer();
      fileName = data.filename;
      mimeType = data.mimetype;
      fileSize = buffer.length;
      storageKey = `${request.tenantId}/business-docs/${Date.now()}-${fileName}`;

      // Get metadata fields from multipart form
      const fields = data.fields as Record<string, any>;
      for (const [key, val] of Object.entries(fields)) {
        if (val && typeof val === 'object' && 'value' in val) metadata[key] = val.value;
      }

      // Upload to R2
      const { uploadFile, isR2Configured } = await import('../../services/r2-storage.js');
      if (await isR2Configured(fastify.db, request.tenantId)) {
        await uploadFile(fastify.db, request.tenantId, storageKey, buffer, mimeType);
      }
    } else {
      // JSON body (no file)
      metadata = request.body as Record<string, string>;
    }

    const [doc] = await fastify.db.insert(businessDocuments).values({
      tenantId: request.tenantId,
      name: metadata.name || fileName || 'Untitled',
      category: metadata.category || 'other',
      subcategory: metadata.subcategory || null,
      description: metadata.description || null,
      fileName,
      fileSize,
      mimeType,
      storageKey,
      issuer: metadata.issuer || null,
      documentNumber: metadata.documentNumber || null,
      issueDate: metadata.issueDate || null,
      expirationDate: metadata.expirationDate || null,
      state: metadata.state || null,
      tags: metadata.tags || null,
      uploadedBy: request.user.sub,
    }).returning();

    reply.code(201);
    return doc;
  });

  // Update business document metadata
  fastify.patch('/api/v1/business-documents/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as Record<string, unknown>;
    const [updated] = await fastify.db.update(businessDocuments)
      .set({ ...body, updatedAt: new Date() })
      .where(and(eq(businessDocuments.id, id), eq(businessDocuments.tenantId, request.tenantId)))
      .returning();
    return updated;
  });

  // Delete business document
  fastify.delete('/api/v1/business-documents/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [doc] = await fastify.db.select().from(businessDocuments)
      .where(and(eq(businessDocuments.id, id), eq(businessDocuments.tenantId, request.tenantId))).limit(1);
    if (doc?.storageKey) {
      const { deleteFile, isR2Configured } = await import('../../services/r2-storage.js');
      if (await isR2Configured(fastify.db, request.tenantId)) {
        await deleteFile(fastify.db, request.tenantId, doc.storageKey).catch(() => {});
      }
    }
    await fastify.db.delete(businessDocuments)
      .where(and(eq(businessDocuments.id, id), eq(businessDocuments.tenantId, request.tenantId)));
    reply.code(204).send();
  });

  // Download business document
  fastify.get('/api/v1/business-documents/:id/download', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const [doc] = await fastify.db.select().from(businessDocuments)
      .where(and(eq(businessDocuments.id, id), eq(businessDocuments.tenantId, request.tenantId))).limit(1);
    if (!doc?.storageKey) { reply.code(404); return { error: 'No file' }; }
    const { getFileUrl, isR2Configured } = await import('../../services/r2-storage.js');
    if (!await isR2Configured(fastify.db, request.tenantId)) { reply.code(503); return { error: 'Storage not configured' }; }
    const url = await getFileUrl(fastify.db, request.tenantId, doc.storageKey);
    reply.redirect(url);
  });

  // ===== USER MANAGEMENT =====

  // List all users for tenant
  fastify.get('/api/v1/settings/users', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    return fastify.db.select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      isActive: users.isActive,
      createdAt: users.createdAt,
    }).from(users)
      .where(eq(users.tenantId, request.tenantId))
      .orderBy(users.displayName);
  });

  // Invite/create user
  fastify.post('/api/v1/settings/users', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const body = request.body as { email: string; displayName: string; role: string; password?: string };
    if (!body.email || !body.displayName) throw new ValidationError('Email and display name are required');

    // Check if user already exists in tenant
    const [existing] = await fastify.db.select({ id: users.id }).from(users)
      .where(and(eq(users.tenantId, request.tenantId), eq(users.email, body.email.toLowerCase()))).limit(1);
    if (existing) throw new ValidationError('A user with this email already exists');

    // Hash password if provided, otherwise generate a random one
    const { hash } = await import('bcryptjs');
    const password = body.password || Math.random().toString(36).slice(-12);
    const passwordHash = await hash(password, 12);

    const [user] = await fastify.db.insert(users).values({
      tenantId: request.tenantId,
      email: body.email.toLowerCase(),
      displayName: body.displayName,
      role: body.role || 'tech',
      passwordHash,
      isActive: true,
    }).returning();

    reply.code(201);
    return { id: user.id, email: user.email, displayName: user.displayName, role: user.role, tempPassword: body.password ? undefined : password };
  });

  // Update user
  fastify.patch('/api/v1/settings/users/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { displayName?: string; role?: string; isActive?: boolean };

    const [updated] = await fastify.db.update(users).set({ ...body, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.tenantId, request.tenantId))).returning();

    return { id: updated.id, email: updated.email, displayName: updated.displayName, role: updated.role, isActive: updated.isActive };
  });

  // Reset user password
  fastify.post('/api/v1/settings/users/:id/reset-password', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { id } = request.params as { id: string };
    const { hash } = await import('bcryptjs');
    const newPassword = Math.random().toString(36).slice(-12);
    const passwordHash = await hash(newPassword, 12);

    await fastify.db.update(users).set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.tenantId, request.tenantId)));

    return { tempPassword: newPassword };
  });

  // Deactivate user (soft delete)
  fastify.delete('/api/v1/settings/users/:id', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    // Don't allow deactivating yourself
    if (id === request.user.sub) throw new ValidationError('Cannot deactivate your own account');

    await fastify.db.update(users).set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(users.id, id), eq(users.tenantId, request.tenantId)));

    reply.code(204).send();
  });
}

function calculateNextRun(frequency: string, dayOfWeek?: number, dayOfMonth?: number): Date {
  const now = new Date();
  switch (frequency) {
    case 'daily': {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    }
    case 'weekly': {
      const next = new Date(now);
      const targetDay = dayOfWeek ?? 1; // Default Monday
      const currentDay = next.getDay();
      let daysUntil = targetDay - currentDay;
      if (daysUntil <= 0) daysUntil += 7;
      next.setDate(next.getDate() + daysUntil);
      next.setHours(8, 0, 0, 0);
      return next;
    }
    case 'monthly': {
      const next = new Date(now);
      const targetDay = dayOfMonth ?? 1;
      next.setMonth(next.getMonth() + 1);
      next.setDate(Math.min(targetDay, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
      next.setHours(8, 0, 0, 0);
      return next;
    }
    default: {
      const next = new Date(now);
      next.setDate(next.getDate() + 1);
      next.setHours(8, 0, 0, 0);
      return next;
    }
  }
}
