import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { users } from '@rivertown/db';

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar';

export async function googleCalendarRoutes(fastify: FastifyInstance) {
  // Get current user's calendar connection status
  fastify.get('/api/v1/integrations/google-calendar/status', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const [user] = await fastify.db.select({
      googleCalendarConnected: users.googleCalendarConnected,
    }).from(users).where(eq(users.id, request.user.sub)).limit(1);

    return { connected: user?.googleCalendarConnected ?? false };
  });

  // Get authorization URL for the current user
  fastify.get('/api/v1/integrations/google-calendar/authorize', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const redirectUri = process.env.GOOGLE_CALENDAR_REDIRECT_URI
      || process.env.GOOGLE_EMAIL_REDIRECT_URI?.replace('/email/', '/calendar/')
      || 'http://localhost:5173/settings/calendar/callback';

    if (!clientId) {
      throw new Error('Google OAuth not configured.');
    }

    const state = request.user.sub; // pass userId through OAuth state

    const authUrl = `${GOOGLE_AUTH_URL}?` + new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: CALENDAR_SCOPES,
      access_type: 'offline',
      prompt: 'consent',
      state,
    }).toString();

    return { authUrl };
  });

  // OAuth callback — exchange code for tokens and store on user
  fastify.post('/api/v1/integrations/google-calendar/callback', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    const { code } = request.body as { code: string };
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    const origin = request.headers.origin || request.headers.referer?.replace(/\/[^/]*$/, '') || '';
    const redirectUri = origin
      ? `${origin}/settings/calendar/callback`
      : process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:5173/settings/calendar/callback';

    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth not configured.');
    }

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
      let errMsg = 'Google Calendar authentication failed';
      try {
        const errJson = JSON.parse(errText);
        errMsg = errJson.error_description || errJson.error || errMsg;
      } catch { errMsg = errText.substring(0, 200); }
      throw new Error(errMsg);
    }

    const tokens = await tokenRes.json() as {
      access_token: string; refresh_token?: string; expires_in: number;
    };

    await fastify.db.update(users).set({
      googleCalendarConnected: true,
      googleCalendarToken: tokens.access_token,
      googleCalendarRefreshToken: tokens.refresh_token ?? null,
      updatedAt: new Date(),
    }).where(eq(users.id, request.user.sub));

    return { success: true };
  });

  // Disconnect calendar
  fastify.post('/api/v1/integrations/google-calendar/disconnect', {
    preHandler: [fastify.authenticate]
  }, async (request) => {
    await fastify.db.update(users).set({
      googleCalendarConnected: false,
      googleCalendarToken: null,
      googleCalendarRefreshToken: null,
      updatedAt: new Date(),
    }).where(eq(users.id, request.user.sub));

    return { success: true };
  });
}
