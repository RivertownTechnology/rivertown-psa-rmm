/**
 * Native APNs push delivery — token-based (.p8 / ES256) provider authentication
 * over HTTP/2, per Apple's "Establishing a token-based connection to APNs".
 */

import http2, { ClientHttp2Session } from 'node:http2';
import { createPrivateKey, createHash, sign as cryptoSign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { readCredentials } from '../common/credentials.js';

const APNS_PRODUCTION_HOST = 'api.push.apple.com';
const APNS_SANDBOX_HOST = 'api.sandbox.push.apple.com';

export type ApnsEnvironment = 'sandbox' | 'production';

export interface ApnsPushPayload {
  aps: {
    alert: { title: string; body?: string };
    sound: string;
    badge: number;
  };
  entityType: 'ticket' | 'invoice' | 'customer';
  entityId: string;
  title: string;
}

export interface ApplePushConfig {
  keyP8: string;
  keyId: string;
  teamId: string;
  bundleId: string;
}

export interface SendApnsPushOptions {
  config: ApplePushConfig;
  deviceToken: string;
  environment: ApnsEnvironment;
  payload: ApnsPushPayload;
}

export class ApnsError extends Error {
  constructor(
    public status: number,
    public reason: string,
    public shouldRemoveToken: boolean,
  ) {
    super(`APNs push failed: ${status} ${reason}`);
    this.name = 'ApnsError';
  }
}

// Resolves Apple Push credentials for a tenant — DB-first (Settings >
// Integrations > Apple Push, encrypted in integration_configs), falling back
// to APNS_KEY_P8/APNS_KEY_ID/APNS_TEAM_ID/APNS_BUNDLE_ID env vars for
// dev/bootstrap use. Returns null if neither is configured/enabled.
export async function getApplePushConfig(db: Database, tenantId: string): Promise<ApplePushConfig | null> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'apple-push')))
    .limit(1);

  if (config?.isEnabled) {
    const creds = readCredentials(config.credentials) as Record<string, string>;
    if (creds.keyP8 && creds.keyId && creds.teamId && creds.bundleId) {
      return { keyP8: creds.keyP8, keyId: creds.keyId, teamId: creds.teamId, bundleId: creds.bundleId };
    }
  }

  const keyP8 = process.env.APNS_KEY_P8 || process.env.APNS_P8;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  const bundleId = process.env.APNS_BUNDLE_ID;
  if (keyP8 && keyId && teamId && bundleId) {
    return { keyP8, keyId, teamId, bundleId };
  }

  return null;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function normalizeP8(raw: string): string {
  // Accept either literal PEM contents (with escaped \n, common for env vars
  // and single-line textarea input) or a filesystem path to the .p8 file.
  if (raw.includes('BEGIN PRIVATE KEY')) {
    return raw.replace(/\\n/g, '\n');
  }
  return readFileSync(raw, 'utf8');
}

// APNs provider tokens are valid for up to 1 hour; refresh a bit early so we
// never race the expiry boundary mid-request. Cached per credential set
// (keyed by a hash of the actual key material) so updating credentials in
// Settings naturally invalidates the old cache entry instead of needing
// explicit cache-busting.
const TOKEN_TTL_MS = 50 * 60 * 1000;
const tokenCache = new Map<string, { jwt: string; issuedAt: number }>();

function cacheKeyFor(config: ApplePushConfig): string {
  return createHash('sha256').update(`${config.keyId}:${config.teamId}:${config.keyP8}`).digest('hex');
}

function getProviderToken(config: ApplePushConfig): string {
  const cacheKey = cacheKeyFor(config);
  const cached = tokenCache.get(cacheKey);
  if (cached && Date.now() - cached.issuedAt < TOKEN_TTL_MS) {
    return cached.jwt;
  }

  const header = { alg: 'ES256', kid: config.keyId };
  const claims = { iss: config.teamId, iat: Math.floor(Date.now() / 1000) };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const key = createPrivateKey(normalizeP8(config.keyP8));
  // ES256 (JWS) requires the raw fixed-length R||S signature, not the DER
  // encoding crypto.sign() produces by default.
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });

  const jwt = `${signingInput}.${base64url(signature)}`;
  tokenCache.set(cacheKey, { jwt, issuedAt: Date.now() });
  return jwt;
}

// One persistent HTTP/2 session per host (sandbox/production), reconnected
// lazily if it errors or closes.
const sessions = new Map<string, ClientHttp2Session>();

function getSession(host: string): ClientHttp2Session {
  const existing = sessions.get(host);
  if (existing && !existing.closed && !existing.destroyed) return existing;

  const session = http2.connect(`https://${host}`);
  session.on('error', () => sessions.delete(host));
  session.on('close', () => sessions.delete(host));
  sessions.set(host, session);
  return session;
}

export async function sendApnsPush(opts: SendApnsPushOptions): Promise<void> {
  const host = opts.environment === 'production' ? APNS_PRODUCTION_HOST : APNS_SANDBOX_HOST;
  const session = getSession(host);
  const token = getProviderToken(opts.config);
  const body = JSON.stringify(opts.payload);

  const { status, responseBody } = await new Promise<{ status: number; responseBody: string }>((resolve, reject) => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${opts.deviceToken}`,
      authorization: `bearer ${token}`,
      'apns-topic': opts.config.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });

    let status = 0;
    let responseBody = '';

    req.on('response', (headers) => {
      status = Number(headers[':status']);
    });
    req.setEncoding('utf8');
    req.on('data', (chunk: string) => { responseBody += chunk; });
    req.on('end', () => resolve({ status, responseBody }));
    req.on('error', reject);

    req.write(body);
    req.end();
  });

  if (status !== 200) {
    let reason = 'Unknown';
    try {
      reason = JSON.parse(responseBody).reason || reason;
    } catch {
      // APNs always returns a JSON body on error; if parsing fails, keep 'Unknown'.
    }

    const shouldRemoveToken = status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered';
    throw new ApnsError(status, reason, shouldRemoveToken);
  }
}
