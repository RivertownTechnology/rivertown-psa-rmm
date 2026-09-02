/**
 * Microsoft Entra ID (Azure AD) OAuth2 / OIDC helper.
 *
 * Reusable, framework-agnostic building blocks for "Sign in with Microsoft".
 * Staff SSO (this phase) imports these; the customer portal SSO will import the
 * same helper later. Nothing here touches Fastify, the database, or process
 * globals beyond reading the MS_* env vars via {@link getMicrosoftConfig}.
 *
 * Single-tenant app: the authorize/token/JWKS tenant segment is MS_TENANT_ID.
 */

import { createRemoteJWKSet, jwtVerify } from 'jose';

const MS_LOGIN_HOST = 'https://login.microsoftonline.com';
const DEFAULT_SCOPES = ['openid', 'email', 'profile', 'User.Read'];

export interface MicrosoftConfig {
  clientId: string;
  clientSecret: string;
  tenantId: string;
  redirectUri: string;
  frontendUrl: string;
}

/** Reads the MS_* env vars. All optional — unset values come back as ''. */
export function getMicrosoftConfig(): MicrosoftConfig {
  return {
    clientId: process.env.MS_CLIENT_ID || '',
    clientSecret: process.env.MS_CLIENT_SECRET || '',
    tenantId: process.env.MS_TENANT_ID || '',
    redirectUri: process.env.MS_REDIRECT_URI || '',
    frontendUrl: process.env.FRONTEND_URL || 'https://psa.rivertowntechnology.com',
  };
}

/** True only when every value required to run the SSO flow is present. */
export function isMicrosoftConfigured(cfg: MicrosoftConfig = getMicrosoftConfig()): boolean {
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.tenantId && cfg.redirectUri);
}

// ---------------------------------------------------------------------------
// Portal (App B) config — a SEPARATE, MULTI-TENANT Entra app for the customer
// portal. Customers sign in with their own Microsoft 365 work/school accounts,
// so there is no fixed tenant here (authority = /organizations) and the
// credentials are distinct from App A (staff, single-tenant, above).
// ---------------------------------------------------------------------------

export interface PortalMicrosoftConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  /** Customer portal SPA base URL — where we deliver the exchange code. */
  portalUrl: string;
}

/** Reads the MS_PORTAL_* env vars. All optional — unset values come back as ''. */
export function getPortalMicrosoftConfig(): PortalMicrosoftConfig {
  return {
    clientId: process.env.MS_PORTAL_CLIENT_ID || '',
    clientSecret: process.env.MS_PORTAL_CLIENT_SECRET || '',
    redirectUri: process.env.MS_PORTAL_REDIRECT_URI || '',
    portalUrl: process.env.PORTAL_URL || 'https://portal.rivertowntechnology.com',
  };
}

/** True only when every value required to run the portal SSO flow is present. */
export function isPortalMicrosoftConfigured(
  cfg: PortalMicrosoftConfig = getPortalMicrosoftConfig(),
): boolean {
  return Boolean(cfg.clientId && cfg.clientSecret && cfg.redirectUri);
}

// ---------------------------------------------------------------------------
// Authorize URL
// ---------------------------------------------------------------------------

export interface BuildAuthorizeUrlOptions {
  state: string;
  redirectUri: string;
  clientId: string;
  tenant: string;
  scopes?: string[];
  /** e.g. 'select_account' — omitted when undefined. */
  prompt?: string;
}

/** Builds the Entra consent URL to redirect the browser to. */
export function buildAuthorizeUrl(opts: BuildAuthorizeUrlOptions): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    response_type: 'code',
    redirect_uri: opts.redirectUri,
    response_mode: 'query',
    scope: (opts.scopes ?? DEFAULT_SCOPES).join(' '),
    state: opts.state,
  });
  if (opts.prompt) params.set('prompt', opts.prompt);
  return `${MS_LOGIN_HOST}/${encodeURIComponent(opts.tenant)}/oauth2/v2.0/authorize?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Token exchange
// ---------------------------------------------------------------------------

export interface MicrosoftTokenResponse {
  access_token?: string;
  id_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface ExchangeCodeOptions {
  code: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
  tenant: string;
  scopes?: string[];
}

/** Swaps an authorization code for tokens at the Entra token endpoint. */
export async function exchangeCodeForTokens(opts: ExchangeCodeOptions): Promise<MicrosoftTokenResponse> {
  const resp = await fetch(`${MS_LOGIN_HOST}/${encodeURIComponent(opts.tenant)}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
      scope: (opts.scopes ?? DEFAULT_SCOPES).join(' '),
    }),
  });

  if (!resp.ok) {
    const detail = await resp.text().catch(() => '');
    throw new Error(`Microsoft token exchange failed: ${resp.status} ${detail}`);
  }

  return resp.json() as Promise<MicrosoftTokenResponse>;
}

// ---------------------------------------------------------------------------
// id_token validation (via tenant JWKS)
// ---------------------------------------------------------------------------

// Cache one remote JWKS per tenant — jose refreshes/rotates keys internally.
const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function getJwks(tenant: string) {
  const url = `${MS_LOGIN_HOST}/${encodeURIComponent(tenant)}/discovery/v2.0/keys`;
  let jwks = jwksCache.get(url);
  if (!jwks) {
    jwks = createRemoteJWKSet(new URL(url));
    jwksCache.set(url, jwks);
  }
  return jwks;
}

export interface MicrosoftIdentity {
  oid: string;
  tid: string;
  email: string;
  name: string;
  preferredUsername: string;
}

export interface ValidateIdTokenOptions {
  tenant: string;
  clientId: string;
}

/**
 * Verifies an Entra id_token against the tenant JWKS, checking signature,
 * issuer, audience, and expiry (jwtVerify enforces exp). Returns the claims we
 * care about. Throws on any verification failure.
 */
export async function validateIdToken(
  idToken: string,
  opts: ValidateIdTokenOptions,
): Promise<MicrosoftIdentity> {
  const jwks = getJwks(opts.tenant);
  const { payload } = await jwtVerify(idToken, jwks, {
    audience: opts.clientId,
    issuer: [
      `${MS_LOGIN_HOST}/${opts.tenant}/v2.0`,
      `https://sts.windows.net/${opts.tenant}/`,
    ],
  });

  const oid = typeof payload.oid === 'string' ? payload.oid : undefined;
  const tid = typeof payload.tid === 'string' ? payload.tid : undefined;
  if (!oid || !tid) {
    throw new Error('Microsoft id_token missing required oid/tid claims');
  }

  const preferredUsername = typeof payload.preferred_username === 'string' ? payload.preferred_username : '';
  const email = (typeof payload.email === 'string' ? payload.email : '') || preferredUsername;

  return {
    oid,
    tid,
    email,
    name: typeof payload.name === 'string' ? payload.name : '',
    preferredUsername,
  };
}

// ---------------------------------------------------------------------------
// Multi-tenant id_token validation (portal / App B)
// ---------------------------------------------------------------------------

export interface ValidateMultiTenantIdTokenOptions {
  /** Expected audience — the portal app's (App B) client id. */
  clientId: string;
}

/**
 * Verifies a MULTI-TENANT Entra id_token (customer portal SSO, App B).
 *
 * Unlike {@link validateIdToken}, we cannot pin the issuer to one tenant here —
 * customers sign in from their own Entra tenants. So we:
 *   1. Verify the signature against the shared `/organizations` JWKS and enforce
 *      the audience (= App B client id) and expiry (jwtVerify checks exp).
 *   2. Then require the issuer to be exactly
 *      `https://login.microsoftonline.com/{tid}/v2.0`, where {tid} is the token's
 *      OWN `tid` claim. This accepts ANY tenant, but the issuer must match its
 *      tenant — an attacker cannot forge a token claiming one tenant while issued
 *      by another.
 *
 * Returns the claims we care about. Throws on any verification failure.
 */
export async function validateMultiTenantIdToken(
  idToken: string,
  opts: ValidateMultiTenantIdTokenOptions,
): Promise<MicrosoftIdentity> {
  // The /organizations JWKS serves the signing keys used across work/school
  // tenants; jose refreshes/rotates them internally.
  const jwks = getJwks('organizations');
  const { payload } = await jwtVerify(idToken, jwks, {
    audience: opts.clientId,
    // No `issuer` here — multi-tenant. Validated manually against tid below.
  });

  const oid = typeof payload.oid === 'string' ? payload.oid : undefined;
  const tid = typeof payload.tid === 'string' ? payload.tid : undefined;
  if (!oid || !tid) {
    throw new Error('Microsoft id_token missing required oid/tid claims');
  }

  // Issuer must be this token's own tenant — accept any tenant, but iss==tid.
  const expectedIssuer = `${MS_LOGIN_HOST}/${tid}/v2.0`;
  if (payload.iss !== expectedIssuer) {
    throw new Error('Microsoft id_token issuer does not match its tenant (tid)');
  }

  const preferredUsername = typeof payload.preferred_username === 'string' ? payload.preferred_username : '';
  const email = (typeof payload.email === 'string' ? payload.email : '') || preferredUsername;

  return {
    oid,
    tid,
    email,
    name: typeof payload.name === 'string' ? payload.name : '',
    preferredUsername,
  };
}
