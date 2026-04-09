import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';

const MICROSOFT_AUTH_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0';
const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';
const SCOPES = 'openid email profile Mail.Read Mail.Send Mail.ReadWrite Calendars.Read Calendars.ReadWrite offline_access';

// Helper to get the Azure app config (from DB or env fallback)
async function getAzureApp(fastify: FastifyInstance, tenantId: string) {
  const [config] = await fastify.db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'microsoft365')))
    .limit(1);

  const creds = (config?.credentials ?? {}) as Record<string, unknown>;

  // Check DB first, then env fallback
  const clientId = (creds.clientId as string) || fastify.config.MS365_CLIENT_ID;
  const clientSecret = (creds.clientSecret as string) || fastify.config.MS365_CLIENT_SECRET;
  const redirectUri = (creds.redirectUri as string) || fastify.config.MS365_REDIRECT_URI || 'http://localhost:5173/settings/email/callback';

  return { clientId, clientSecret, redirectUri, config, creds };
}

interface Mailbox {
  email: string; displayName: string;
  accessToken: string; refreshToken?: string; expiresAt: number;
}

function getMailboxes(creds: Record<string, unknown>): Mailbox[] {
  // Support new array format and legacy single-mailbox format
  if (Array.isArray(creds.mailboxes)) return creds.mailboxes as Mailbox[];
  if (creds.accessToken && creds.email) {
    return [{ email: creds.email as string, displayName: (creds.displayName as string) ?? '', accessToken: creds.accessToken as string, refreshToken: creds.refreshToken as string | undefined, expiresAt: (creds.expiresAt as number) ?? 0 }];
  }
  return [];
}

export async function microsoft365Routes(fastify: FastifyInstance) {
  // Get connection status
  fastify.get('/api/v1/integrations/microsoft365/status', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { clientId, config, creds } = await getAzureApp(fastify, request.tenantId);
    const mailboxes = config?.isEnabled ? getMailboxes(creds) : [];

    return {
      connected: mailboxes.length > 0,
      email: mailboxes[0]?.email ?? null,
      configured: !!clientId,
      needsSetup: !clientId,
      mailboxes: mailboxes.map(m => ({ email: m.email, displayName: m.displayName })),
    };
  });

  // Save Azure app registration (one-time setup)
  fastify.post('/api/v1/integrations/microsoft365/setup', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { clientId, clientSecret } = request.body as { clientId: string; clientSecret: string };
    const redirectUri = `${request.headers.origin ?? 'http://localhost:5173'}/settings/email/callback`;

    const [existing] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'microsoft365')))
      .limit(1);

    const credentials = { clientId, clientSecret, redirectUri };

    if (existing) {
      await fastify.db.update(integrationConfigs).set({
        credentials: { ...(existing.credentials as object), ...credentials },
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, existing.id));
    } else {
      await fastify.db.insert(integrationConfigs).values({
        tenantId: request.tenantId, provider: 'microsoft365',
        isEnabled: false, credentials,
      });
    }

    return { success: true };
  });

  // Get authorization URL — just redirects to Microsoft login
  fastify.get('/api/v1/integrations/microsoft365/authorize', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { clientId, redirectUri } = await getAzureApp(fastify, request.tenantId);

    if (!clientId) {
      throw new Error('Microsoft 365 has not been set up yet.');
    }

    const authUrl = `${MICROSOFT_AUTH_URL}/authorize?` + new URLSearchParams({
      client_id: clientId,
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: SCOPES,
      response_mode: 'query',
      prompt: 'select_account',
    }).toString();

    return { authUrl };
  });

  // OAuth callback — exchange code for tokens
  fastify.post('/api/v1/integrations/microsoft365/callback', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { code } = request.body as { code: string };
    const { clientId, clientSecret, redirectUri: storedRedirectUri } = await getAzureApp(fastify, request.tenantId);
    // Use the origin from the request to build redirect URI (handles domain changes)
    const origin = request.headers.origin || request.headers.referer?.replace(/\/[^/]*$/, '') || '';
    const redirectUri = origin ? `${origin}/settings/email/callback` : storedRedirectUri;

    if (!clientId || !clientSecret) {
      throw new Error('Microsoft 365 has not been set up yet.');
    }

    const tokenRes = await fetch(`${MICROSOFT_AUTH_URL}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        scope: SCOPES,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      let errMsg = 'Microsoft authentication failed';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error_description || errJson.error || errMsg;
      } catch { errMsg = errText.substring(0, 200); }
      throw new Error(errMsg);
    }

    const tokens = await tokenRes.json() as {
      access_token: string; refresh_token?: string; expires_in: number;
    };

    const meRes = await fetch(`${GRAPH_API_URL}/me`, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const me = await meRes.json() as { mail?: string; userPrincipalName?: string; displayName?: string };
    const email = me.mail ?? me.userPrincipalName ?? '';
    const displayName = me.displayName ?? '';

    // Update the M365 config — add/update mailbox in array
    const [existing] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'microsoft365')))
      .limit(1);

    const existingCreds = (existing?.credentials ?? {}) as Record<string, unknown>;
    const mailboxes = getMailboxes(existingCreds);
    const newMailbox: Mailbox = {
      email, displayName,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
    };

    // Replace if same email already exists, otherwise add
    const idx = mailboxes.findIndex(m => m.email.toLowerCase() === email.toLowerCase());
    if (idx >= 0) mailboxes[idx] = newMailbox;
    else mailboxes.push(newMailbox);

    const credentials = {
      clientId: existingCreds.clientId,
      clientSecret: existingCreds.clientSecret,
      redirectUri: existingCreds.redirectUri,
      mailboxes,
    };

    if (existing) {
      await fastify.db.update(integrationConfigs).set({
        isEnabled: true, credentials, updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, existing.id));
    } else {
      await fastify.db.insert(integrationConfigs).values({
        tenantId: request.tenantId, provider: 'microsoft365',
        isEnabled: true, credentials,
      });
    }

    // Auto-configure email to use O365 (primary = first mailbox)
    const primaryEmail = mailboxes[0].email;
    const primaryName = mailboxes[0].displayName;
    const primaryToken = mailboxes[0].accessToken;

    const [emailConfig] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'email')))
      .limit(1);

    const emailCreds = {
      ...((emailConfig?.credentials as object) ?? {}),
      provider: 'microsoft365',
      fromAddress: primaryEmail,
      fromName: primaryName || 'Rivertown PSA',
      accessToken: primaryToken,
    };

    if (emailConfig) {
      await fastify.db.update(integrationConfigs).set({
        isEnabled: true, credentials: emailCreds, updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, emailConfig.id));
    } else {
      await fastify.db.insert(integrationConfigs).values({
        tenantId: request.tenantId, provider: 'email',
        isEnabled: true, credentials: emailCreds,
      });
    }

    return { success: true, email, displayName };
  });

  // Disconnect a specific mailbox (or all if no email provided)
  fastify.post('/api/v1/integrations/microsoft365/disconnect', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { email: targetEmail } = (request.body ?? {}) as { email?: string };

    const [config] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'microsoft365')))
      .limit(1);

    if (config) {
      const creds = (config.credentials ?? {}) as Record<string, unknown>;
      let mailboxes = getMailboxes(creds);

      if (targetEmail) {
        // Remove specific mailbox
        mailboxes = mailboxes.filter(m => m.email.toLowerCase() !== targetEmail.toLowerCase());
      } else {
        // Remove all
        mailboxes = [];
      }

      const updatedCreds: Record<string, unknown> = {
        clientId: creds.clientId, clientSecret: creds.clientSecret, redirectUri: creds.redirectUri,
        mailboxes,
      };

      await fastify.db.update(integrationConfigs).set({
        isEnabled: mailboxes.length > 0,
        credentials: updatedCreds,
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, config.id));

      // Update email config primary if mailboxes remain
      if (mailboxes.length > 0) {
        const [emailCfg] = await fastify.db.select().from(integrationConfigs)
          .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'email')))
          .limit(1);
        if (emailCfg) {
          const eCreds = { ...(emailCfg.credentials as object), fromAddress: mailboxes[0].email, fromName: mailboxes[0].displayName, accessToken: mailboxes[0].accessToken };
          await fastify.db.update(integrationConfigs).set({ credentials: eCreds, updatedAt: new Date() }).where(eq(integrationConfigs.id, emailCfg.id));
        }
      }
    }

    return { success: true };
  });
}
