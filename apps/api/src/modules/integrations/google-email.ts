import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';
import { readCredentials } from '../../common/credentials.js';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GMAIL_SCOPES = 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/gmail.modify';

async function getGoogleApp(fastify: FastifyInstance, tenantId: string) {
  const [config] = await fastify.db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'google-email')))
    .limit(1);

  const creds = (config?.credentials ?? {}) as Record<string, unknown>;

  // Use env vars only for redirect URI (prevent DB-stored override for security)
  const clientId = (creds.clientId as string) || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = (creds.clientSecret as string) || process.env.GOOGLE_CLIENT_SECRET || '';
  const redirectUri = process.env.GOOGLE_EMAIL_REDIRECT_URI || 'http://localhost:5173/settings/email/callback';

  return { clientId, clientSecret, redirectUri, config, creds };
}

interface Mailbox {
  email: string; displayName: string;
  accessToken: string; refreshToken?: string; expiresAt: number;
}

function getMailboxes(creds: Record<string, unknown>): Mailbox[] {
  if (Array.isArray(creds.mailboxes)) return creds.mailboxes as Mailbox[];
  if (creds.accessToken && creds.email) {
    return [{
      email: creds.email as string, displayName: (creds.displayName as string) ?? '',
      accessToken: creds.accessToken as string, refreshToken: creds.refreshToken as string | undefined,
      expiresAt: (creds.expiresAt as number) ?? 0,
    }];
  }
  return [];
}

export async function googleEmailRoutes(fastify: FastifyInstance) {
  // Get connection status
  fastify.get('/api/v1/integrations/google-email/status', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { clientId, config, creds } = await getGoogleApp(fastify, request.tenantId);
    const mailboxes = config?.isEnabled ? getMailboxes(creds) : [];

    return {
      connected: mailboxes.length > 0,
      email: mailboxes[0]?.email ?? null,
      configured: !!clientId,
      needsSetup: !clientId,
      mailboxes: mailboxes.map(m => ({ email: m.email, displayName: m.displayName })),
    };
  });

  // Get authorization URL — redirects to Google consent screen
  fastify.get('/api/v1/integrations/google-email/authorize', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { clientId, redirectUri } = await getGoogleApp(fastify, request.tenantId);

    if (!clientId) {
      throw new Error('Google email has not been configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET environment variables.');
    }

    const authUrl = `${GOOGLE_AUTH_URL}?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
    }).toString();

    return { authUrl };
  });

  // OAuth callback — exchange code for tokens
  fastify.post('/api/v1/integrations/google-email/callback', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { code } = request.body as { code: string };
    const { clientId, clientSecret, redirectUri: storedRedirectUri } = await getGoogleApp(fastify, request.tenantId);
    // Use stored redirect URI only — never trust Origin/Referer headers
    const redirectUri = storedRedirectUri;

    if (!clientId || !clientSecret) {
      throw new Error('Google email has not been configured.');
    }

    // Exchange code for tokens
    const tokenRes = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      let errMsg = 'Google authentication failed';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error_description || errJson.error || errMsg;
      } catch { errMsg = errText.substring(0, 200); }
      throw new Error(errMsg);
    }

    const tokens = await tokenRes.json() as {
      access_token: string; refresh_token?: string; expires_in: number;
    };

    // Get user profile (email + name)
    const profileRes = await fetch(GOOGLE_USERINFO_URL, {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const profile = await profileRes.json() as { email?: string; name?: string };
    const email = profile.email ?? '';
    const displayName = profile.name ?? '';

    // Update the google-email config — add/update mailbox in array
    const [existing] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'google-email')))
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
      clientId: existingCreds.clientId || clientId,
      clientSecret: existingCreds.clientSecret || clientSecret,
      redirectUri: existingCreds.redirectUri || redirectUri,
      mailboxes,
    };

    if (existing) {
      await fastify.db.update(integrationConfigs).set({
        isEnabled: true, credentials, updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, existing.id));
    } else {
      await fastify.db.insert(integrationConfigs).values({
        tenantId: request.tenantId, provider: 'google-email',
        isEnabled: true, credentials,
      });
    }

    // Auto-configure email provider to use Google
    const primaryEmail = mailboxes[0].email;
    const primaryName = mailboxes[0].displayName;
    const primaryToken = mailboxes[0].accessToken;

    const [emailConfig] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'email')))
      .limit(1);

    const emailCreds = {
      ...((emailConfig?.credentials as object) ?? {}),
      provider: 'google-email',
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
  fastify.post('/api/v1/integrations/google-email/disconnect', {
    preHandler: [fastify.authenticate, requirePermission('*')]
  }, async (request) => {
    const { email: targetEmail } = (request.body ?? {}) as { email?: string };

    const [config] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'google-email')))
      .limit(1);

    if (config) {
      const creds = readCredentials(config.credentials) as Record<string, unknown>;
      let mailboxes = getMailboxes(creds);

      if (targetEmail) {
        mailboxes = mailboxes.filter(m => m.email.toLowerCase() !== targetEmail.toLowerCase());
      } else {
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
