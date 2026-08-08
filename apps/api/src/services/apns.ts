/**
 * Native APNs push delivery — token-based (.p8 / ES256) provider authentication
 * over HTTP/2, per Apple's "Establishing a token-based connection to APNs".
 */

import http2, { ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { readFileSync } from 'node:fs';

const APNS_PRODUCTION_HOST = 'api.push.apple.com';
const APNS_SANDBOX_HOST = 'api.sandbox.push.apple.com';

export type ApnsEnvironment = 'sandbox' | 'production';

export interface ApnsPushPayload {
  aps: {
    alert: { title: string; body?: string };
    sound: string;
    badge: number;
  };
  type: string;
  entityType?: string | null;
  entityId?: string | null;
  notificationId: string;
}

export interface SendApnsPushOptions {
  deviceToken: string;
  bundleId: string;
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

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function loadP8Key(): string {
  const raw = process.env.APNS_P8;
  if (!raw) throw new Error('APNS_P8 is not configured');
  // Accept either literal PEM contents (with escaped \n, common for env vars)
  // or a filesystem path to the .p8 file.
  if (raw.includes('BEGIN PRIVATE KEY')) {
    return raw.replace(/\\n/g, '\n');
  }
  return readFileSync(raw, 'utf8');
}

// APNs provider tokens are valid for up to 1 hour; refresh a bit early so we
// never race the expiry boundary mid-request.
const TOKEN_TTL_MS = 50 * 60 * 1000;
let cachedToken: { jwt: string; issuedAt: number } | null = null;

function getProviderToken(): string {
  if (cachedToken && Date.now() - cachedToken.issuedAt < TOKEN_TTL_MS) {
    return cachedToken.jwt;
  }

  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;
  if (!keyId || !teamId) throw new Error('APNS_KEY_ID / APNS_TEAM_ID are not configured');

  const header = { alg: 'ES256', kid: keyId };
  const claims = { iss: teamId, iat: Math.floor(Date.now() / 1000) };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;

  const key = createPrivateKey(loadP8Key());
  // ES256 (JWS) requires the raw fixed-length R||S signature, not the DER
  // encoding crypto.sign() produces by default.
  const signature = cryptoSign('sha256', Buffer.from(signingInput), {
    key,
    dsaEncoding: 'ieee-p1363',
  });

  const jwt = `${signingInput}.${base64url(signature)}`;
  cachedToken = { jwt, issuedAt: Date.now() };
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
  const token = getProviderToken();
  const body = JSON.stringify(opts.payload);

  const { status, responseBody } = await new Promise<{ status: number; responseBody: string }>((resolve, reject) => {
    const req = session.request({
      ':method': 'POST',
      ':path': `/3/device/${opts.deviceToken}`,
      authorization: `bearer ${token}`,
      'apns-topic': opts.bundleId,
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
