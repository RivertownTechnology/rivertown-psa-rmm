import { FastifyInstance } from 'fastify';
import { randomBytes } from 'crypto';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import { requirePermission } from '../../auth/rbac.js';

// Intuit OAuth endpoints
const INTUIT_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
const INTUIT_REVOKE_URL = 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke';
const QBO_SCOPE = 'com.intuit.quickbooks.accounting';

const QBO_API_BASE_PROD = 'https://quickbooks.api.intuit.com/v3/company';
const QBO_API_BASE_SANDBOX = 'https://sandbox-quickbooks.api.intuit.com/v3/company';

const VALID_SYNC_FREQUENCIES = ['15min', '30min', 'hourly', '4hours', 'daily'] as const;

// In-memory lock to prevent concurrent token refreshes per tenant
const refreshLocks = new Map<string, Promise<void>>();

// In-memory OAuth state nonces (short-lived, 10 min TTL)
const oauthStateMap = new Map<string, { tenantId: string; expiresAt: number }>();

// ── Types ──────────────────────────────────────────────────────

interface QBOCredentials {
  accessToken: string;
  refreshToken: string;
  realmId: string;
  tokenExpiresAt: number;
  companyName?: string;
}

interface QBOSettings {
  syncFrequency?: string;
  defaultItemId?: string;
}

// ── Helpers ────────────────────────────────────────────────────

function getQBOEnv(fastify: FastifyInstance) {
  const config = fastify.config as Record<string, unknown>;
  return {
    clientId: (config.QBO_CLIENT_ID as string) || '',
    clientSecret: (config.QBO_CLIENT_SECRET as string) || '',
    redirectUri: (config.QBO_REDIRECT_URI as string) || 'http://localhost:5173/settings/quickbooks/callback',
    sandbox: !!(config.QBO_SANDBOX),
  };
}

function getApiBase(sandbox: boolean): string {
  return sandbox ? QBO_API_BASE_SANDBOX : QBO_API_BASE_PROD;
}

/** Refresh QBO access token using refresh token. Returns updated credentials. */
async function refreshQBOToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ accessToken: string; refreshToken: string; tokenExpiresAt: number }> {
  const res = await fetch(INTUIT_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QBO token refresh failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    tokenExpiresAt: Date.now() + data.expires_in * 1000,
  };
}

/**
 * Load QBO auth for a tenant. Auto-refreshes token if within 60s of expiry.
 * Returns null if QBO is not connected/enabled.
 */
export async function getQBOAuth(
  db: any,
  tenantId: string,
  env: { clientId: string; clientSecret: string; sandbox: boolean },
): Promise<{ accessToken: string; realmId: string; apiBase: string; configId: string } | null> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'quickbooks')))
    .limit(1);

  if (!config?.isEnabled) return null;

  const creds = config.credentials as QBOCredentials | null;
  if (!creds?.accessToken || !creds?.refreshToken || !creds?.realmId) return null;

  // Auto-refresh if within 60 seconds of expiry
  if (creds.tokenExpiresAt < Date.now() + 60_000) {
    // Use lock to prevent concurrent refresh attempts (Intuit rotates refresh tokens)
    const lockKey = tenantId;
    if (refreshLocks.has(lockKey)) {
      await refreshLocks.get(lockKey);
      // Re-read config after waiting for the other refresh to complete
      return getQBOAuth(db, tenantId, env);
    }

    let resolveLock: () => void;
    const lockPromise = new Promise<void>((resolve) => { resolveLock = resolve; });
    refreshLocks.set(lockKey, lockPromise);

    try {
      const refreshed = await refreshQBOToken(env.clientId, env.clientSecret, creds.refreshToken);
      const updatedCreds: QBOCredentials = {
        ...creds,
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken,
        tokenExpiresAt: refreshed.tokenExpiresAt,
      };

      await db.update(integrationConfigs).set({
        credentials: updatedCreds,
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, config.id));

      return {
        accessToken: refreshed.accessToken,
        realmId: creds.realmId,
        apiBase: getApiBase(env.sandbox),
        configId: config.id,
      };
    } catch (err) {
      // Refresh failed — mark as error
      await db.update(integrationConfigs).set({
        syncStatus: 'error',
        syncError: 'QuickBooks authorization expired. Please reconnect.',
        isEnabled: false,
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, config.id));
      return null;
    } finally {
      refreshLocks.delete(lockKey);
      resolveLock!();
    }
  }

  return {
    accessToken: creds.accessToken,
    realmId: creds.realmId,
    apiBase: getApiBase(env.sandbox),
    configId: config.id,
  };
}

/** Authenticated fetch to QBO REST API v3 */
export async function qboFetch<T>(
  accessToken: string,
  apiBase: string,
  realmId: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = `${apiBase}/${realmId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`QBO API error (${res.status}): ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Routes ─────────────────────────────────────────────────────

export async function quickbooksRoutes(fastify: FastifyInstance) {
  // ─── Get connection status & settings ───
  fastify.get('/api/v1/settings/quickbooks', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const [config] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'quickbooks')))
      .limit(1);

    if (!config) {
      return {
        connected: false,
        isEnabled: false,
        companyName: null,
        realmId: null,
        lastSyncAt: null,
        syncStatus: null,
        syncError: null,
        syncFrequency: 'daily',
      };
    }

    const creds = (config.credentials ?? {}) as Partial<QBOCredentials>;
    const settings = (config.settings ?? {}) as QBOSettings;

    return {
      connected: !!(creds.accessToken && creds.realmId),
      isEnabled: config.isEnabled,
      companyName: creds.companyName ?? null,
      realmId: creds.realmId ? '••••' + creds.realmId.slice(-4) : null,
      lastSyncAt: config.lastSyncAt,
      syncStatus: config.syncStatus,
      syncError: config.syncError,
      syncFrequency: settings.syncFrequency ?? 'daily',
    };
  });

  // ─── Update settings (sync frequency, etc.) ───
  fastify.put('/api/v1/settings/quickbooks', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const body = request.body as { syncFrequency?: string };

    // Validate sync frequency against allowlist
    if (body.syncFrequency && !VALID_SYNC_FREQUENCIES.includes(body.syncFrequency as any)) {
      throw new Error(`Invalid sync frequency. Must be one of: ${VALID_SYNC_FREQUENCIES.join(', ')}`);
    }

    const [existing] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'quickbooks')))
      .limit(1);

    if (!existing) throw new Error('QuickBooks is not connected. Please connect first.');

    const currentSettings = (existing.settings ?? {}) as QBOSettings;
    const updatedSettings: QBOSettings = {
      ...currentSettings,
      ...(body.syncFrequency ? { syncFrequency: body.syncFrequency } : {}),
    };

    await fastify.db.update(integrationConfigs).set({
      settings: updatedSettings,
      updatedAt: new Date(),
    }).where(eq(integrationConfigs.id, existing.id));

    return { success: true };
  });

  // ─── Get OAuth authorization URL ───
  fastify.get('/api/v1/integrations/quickbooks/authorize', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const env = getQBOEnv(fastify);

    if (!env.clientId || !env.clientSecret) {
      throw new Error('QuickBooks has not been configured. Set QBO_CLIENT_ID and QBO_CLIENT_SECRET environment variables.');
    }

    // Generate cryptographic nonce for CSRF protection
    const state = randomBytes(32).toString('hex');
    oauthStateMap.set(state, { tenantId: request.tenantId, expiresAt: Date.now() + 10 * 60 * 1000 });

    // Clean up expired states
    for (const [key, val] of oauthStateMap) {
      if (val.expiresAt < Date.now()) oauthStateMap.delete(key);
    }

    const authUrl = `${INTUIT_AUTH_URL}?` + new URLSearchParams({
      client_id: env.clientId,
      redirect_uri: env.redirectUri,
      response_type: 'code',
      scope: QBO_SCOPE,
      state,
    }).toString();

    return { authUrl };
  });

  // ─── OAuth callback — exchange code for tokens ───
  fastify.post('/api/v1/integrations/quickbooks/callback', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const { code, realmId, state } = request.body as { code: string; realmId: string; state: string };
    const env = getQBOEnv(fastify);

    if (!env.clientId || !env.clientSecret) {
      throw new Error('QuickBooks has not been configured.');
    }

    // Validate OAuth state (CSRF protection)
    const stateEntry = oauthStateMap.get(state);
    if (!stateEntry || stateEntry.tenantId !== request.tenantId || stateEntry.expiresAt < Date.now()) {
      throw new Error('Invalid or expired OAuth state. Please try connecting again.');
    }
    oauthStateMap.delete(state);

    // Validate realmId is numeric (Intuit company IDs are always numeric)
    if (!/^\d+$/.test(realmId)) {
      throw new Error('Invalid QuickBooks company ID.');
    }

    // Exchange authorization code for tokens
    const tokenRes = await fetch(INTUIT_TOKEN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')}`,
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: env.redirectUri,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      let errMsg = 'QuickBooks authentication failed';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error_description || errJson.error || errMsg;
      } catch { errMsg = errText.substring(0, 200); }
      throw new Error(errMsg);
    }

    const tokens = (await tokenRes.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    // Fetch company info from QBO
    const apiBase = getApiBase(env.sandbox);
    let companyName = '';
    try {
      const info = await qboFetch<{ CompanyInfo: { CompanyName: string } }>(
        tokens.access_token, apiBase, realmId, 'GET',
        '/companyinfo/' + realmId,
      );
      companyName = info.CompanyInfo?.CompanyName ?? '';
    } catch {
      // Non-critical — we can proceed without the name
    }

    const credentials: QBOCredentials = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      realmId,
      tokenExpiresAt: Date.now() + tokens.expires_in * 1000,
      companyName,
    };

    // Upsert integration config
    const [existing] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'quickbooks')))
      .limit(1);

    if (existing) {
      await fastify.db.update(integrationConfigs).set({
        isEnabled: true,
        credentials,
        syncStatus: 'idle',
        syncError: null,
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, existing.id));
    } else {
      await fastify.db.insert(integrationConfigs).values({
        tenantId: request.tenantId,
        provider: 'quickbooks',
        isEnabled: true,
        credentials,
        settings: { syncFrequency: 'daily' },
        syncStatus: 'idle',
      });
    }

    return { success: true, companyName };
  });

  // ─── Disconnect QuickBooks ───
  fastify.post('/api/v1/integrations/quickbooks/disconnect', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const [config] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'quickbooks')))
      .limit(1);

    if (config) {
      const creds = (config.credentials ?? {}) as Partial<QBOCredentials>;
      const env = getQBOEnv(fastify);

      // Best-effort token revocation
      if (creds.refreshToken && env.clientId && env.clientSecret) {
        try {
          await fetch(INTUIT_REVOKE_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Basic ${Buffer.from(`${env.clientId}:${env.clientSecret}`).toString('base64')}`,
            },
            body: JSON.stringify({ token: creds.refreshToken }),
          });
        } catch {
          // Revocation failure is non-critical
        }
      }

      await fastify.db.update(integrationConfigs).set({
        isEnabled: false,
        credentials: {},
        syncStatus: null,
        syncError: null,
        lastSyncAt: null,
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, config.id));
    }

    return { success: true };
  });

  // ─── Connection status (lightweight check) ───
  fastify.get('/api/v1/settings/quickbooks/status', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const env = getQBOEnv(fastify);
    const [config] = await fastify.db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, request.tenantId), eq(integrationConfigs.provider, 'quickbooks')))
      .limit(1);

    const creds = (config?.credentials ?? {}) as Partial<QBOCredentials>;

    return {
      configured: !!(env.clientId && env.clientSecret),
      connected: !!(config?.isEnabled && creds.accessToken && creds.realmId),
      companyName: creds.companyName ?? null,
    };
  });

  // ─── Manual sync trigger ───
  fastify.post('/api/v1/settings/quickbooks/sync', {
    preHandler: [fastify.authenticate, requirePermission('*')],
  }, async (request) => {
    const env = getQBOEnv(fastify);
    const auth = await getQBOAuth(fastify.db, request.tenantId, env);
    if (!auth) throw new Error('QuickBooks is not connected. Please connect first.');

    // Mark as syncing
    await fastify.db.update(integrationConfigs).set({
      syncStatus: 'syncing',
      syncError: null,
      updatedAt: new Date(),
    }).where(eq(integrationConfigs.id, auth.configId));

    try {
      const { runQBOSyncForTenant } = await import('../../services/qbo-sync.js');
      const result = await runQBOSyncForTenant(fastify.db, request.tenantId, env);

      await fastify.db.update(integrationConfigs).set({
        syncStatus: 'idle',
        syncError: null,
        lastSyncAt: new Date(),
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, auth.configId));

      return { success: true, ...result };
    } catch (err: any) {
      const internalMessage = err.message ?? 'Sync failed';
      console.error('[QBO] Manual sync failed:', internalMessage);

      await fastify.db.update(integrationConfigs).set({
        syncStatus: 'error',
        syncError: internalMessage,
        updatedAt: new Date(),
      }).where(eq(integrationConfigs.id, auth.configId));

      // Don't leak QBO API error details to the client
      throw new Error('QuickBooks sync failed. Check the sync status for details.');
    }
  });
}
