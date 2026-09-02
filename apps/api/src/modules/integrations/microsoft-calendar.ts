import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '@rivertown/db';
import { buildAuthorizeUrl, exchangeCodeForTokens } from '../../auth/microsoft-oauth.js';

// Per-user delegated Microsoft 365 (Outlook) Calendar OAuth.
// Mirrors google-calendar.ts, but against the single Entra tenant (App A).
// Needs a refresh token, so `offline_access` is included in the scope set.
const CALENDAR_SCOPES = [
  'openid',
  'offline_access',
  'https://graph.microsoft.com/Calendars.ReadWrite',
];

const DEFAULT_REDIRECT_URI = 'http://localhost:5173/settings/microsoft-calendar/callback';

/** Frontend redirect URI the browser lands on after Entra consent. */
function calendarRedirectUri(): string {
  const frontend = process.env.FRONTEND_URL?.replace(/\/$/, '');
  return (
    process.env.MS_CALENDAR_REDIRECT_URI ||
    (frontend ? `${frontend}/settings/microsoft-calendar/callback` : '') ||
    DEFAULT_REDIRECT_URI
  );
}

export async function microsoftCalendarRoutes(fastify: FastifyInstance) {
  // Get current user's Microsoft calendar connection status
  fastify.get('/api/v1/integrations/microsoft-calendar/status', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const [user] = await fastify.db.select({
      msCalendarConnected: users.msCalendarConnected,
    }).from(users).where(eq(users.id, request.user.sub)).limit(1);

    return { connected: user?.msCalendarConnected ?? false };
  });

  // Get authorization URL for the current user
  fastify.get('/api/v1/integrations/microsoft-calendar/authorize', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const clientId = process.env.MS_CLIENT_ID || '';
    const tenantId = process.env.MS_TENANT_ID || '';

    if (!clientId || !tenantId) {
      reply.code(503);
      return { error: 'Microsoft 365 Calendar is not configured on this server.' };
    }

    const state = request.user.sub; // pass userId through OAuth state

    const authUrl = buildAuthorizeUrl({
      clientId,
      tenant: tenantId,
      redirectUri: calendarRedirectUri(),
      scopes: CALENDAR_SCOPES,
      state,
      prompt: 'consent',
    });

    return { authUrl };
  });

  // OAuth callback — exchange code for tokens and store on user
  fastify.post('/api/v1/integrations/microsoft-calendar/callback', {
    preHandler: [fastify.authenticate]
  }, async (request, reply) => {
    const { code } = request.body as { code: string };
    const clientId = process.env.MS_CLIENT_ID || '';
    const clientSecret = process.env.MS_CLIENT_SECRET || '';
    const tenantId = process.env.MS_TENANT_ID || '';

    if (!clientId || !clientSecret || !tenantId) {
      reply.code(503);
      return { error: 'Microsoft 365 Calendar is not configured on this server.' };
    }

    // Use configured redirect URI only — never trust Origin/Referer headers
    const tokens = await exchangeCodeForTokens({
      code,
      clientId,
      clientSecret,
      tenant: tenantId,
      redirectUri: calendarRedirectUri(),
      scopes: CALENDAR_SCOPES,
    });

    if (!tokens.access_token) {
      throw new Error('Microsoft Calendar authentication failed: no access token returned');
    }

    await fastify.db.update(users).set({
      msCalendarConnected: true,
      msCalendarToken: tokens.access_token,
      msCalendarRefreshToken: tokens.refresh_token ?? null,
      updatedAt: new Date(),
    }).where(eq(users.id, request.user.sub));

    return { success: true };
  });

  // Disconnect calendar
  fastify.post('/api/v1/integrations/microsoft-calendar/disconnect', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    await fastify.db.update(users).set({
      msCalendarConnected: false,
      msCalendarToken: null,
      msCalendarRefreshToken: null,
      updatedAt: new Date(),
    }).where(eq(users.id, request.user.sub));

    return { success: true };
  });
}
