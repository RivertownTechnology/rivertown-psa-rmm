import { eq, and } from 'drizzle-orm';
import { users, calendarEvents } from '@rivertown/db';
import type { Database } from '@rivertown/db';

const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

async function getFreshCalendarToken(db: Database, tenantId: string, userId: string): Promise<string | null> {
  const [user] = await db.select({
    googleCalendarConnected: users.googleCalendarConnected,
    googleCalendarToken: users.googleCalendarToken,
    googleCalendarRefreshToken: users.googleCalendarRefreshToken,
  }).from(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId))).limit(1);

  if (!user?.googleCalendarConnected || !user.googleCalendarToken) return null;

  // Try refresh if we have a refresh token
  // Google access tokens last 1 hour; always attempt refresh to be safe
  if (user.googleCalendarRefreshToken) {
    const clientId = process.env.GOOGLE_CLIENT_ID || '';
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET || '';
    if (clientId && clientSecret) {
      try {
        const res = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId, client_secret: clientSecret,
            refresh_token: user.googleCalendarRefreshToken,
            grant_type: 'refresh_token',
          }),
        });
        if (res.ok) {
          const tokens = await res.json() as { access_token: string; expires_in: number };
          await db.update(users).set({
            googleCalendarToken: tokens.access_token,
            updatedAt: new Date(),
          }).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
          return tokens.access_token;
        }
      } catch (err) {
        console.error(`[CALENDAR] Token refresh failed for user ${userId}:`, err);
      }
    }
  }

  return user.googleCalendarToken;
}

export async function syncEventToGoogleCalendar(
  db: Database, tenantId: string, userId: string,
  event: { id: string; title: string; description: string | null; startAt: Date; endAt: Date; googleEventId: string | null },
) {
  const token = await getFreshCalendarToken(db, tenantId, userId);
  if (!token) return;

  const calendarEvent = {
    summary: event.title,
    description: event.description ?? '',
    start: { dateTime: event.startAt.toISOString(), timeZone: 'UTC' },
    end: { dateTime: event.endAt.toISOString(), timeZone: 'UTC' },
  };

  if (event.googleEventId) {
    // Update existing event
    await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${event.googleEventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(calendarEvent),
    });
  } else {
    // Create new event
    const res = await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(calendarEvent),
    });
    if (res.ok) {
      const created = await res.json() as { id: string };
      await db.update(calendarEvents).set({ googleEventId: created.id, syncedAt: new Date() })
        .where(eq(calendarEvents.id, event.id));
    }
  }
}

export async function deleteGoogleCalendarEvent(db: Database, tenantId: string, userId: string, googleEventId: string) {
  const token = await getFreshCalendarToken(db, tenantId, userId);
  if (!token) return;

  await fetch(`${GOOGLE_CALENDAR_API}/calendars/primary/events/${googleEventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}

// ---------------------------------------------------------------------------
// Microsoft 365 (Outlook) Calendar — per-user delegated Graph sync.
// Mirrors the Google functions above; kept fully independent so a failure in
// one provider never blocks the other.
// ---------------------------------------------------------------------------

const MS_GRAPH_API = 'https://graph.microsoft.com/v1.0';
const MS_LOGIN_HOST = 'https://login.microsoftonline.com';
const MS_CALENDAR_SCOPES = 'openid offline_access https://graph.microsoft.com/Calendars.ReadWrite';

async function getFreshMicrosoftCalendarToken(db: Database, tenantId: string, userId: string): Promise<string | null> {
  const [user] = await db.select({
    msCalendarConnected: users.msCalendarConnected,
    msCalendarToken: users.msCalendarToken,
    msCalendarRefreshToken: users.msCalendarRefreshToken,
  }).from(users).where(and(eq(users.id, userId), eq(users.tenantId, tenantId))).limit(1);

  if (!user?.msCalendarConnected || !user.msCalendarToken) return null;

  // Microsoft access tokens are short-lived; always attempt a refresh when we
  // hold a refresh token so long-running syncs don't fail on an expired token.
  if (user.msCalendarRefreshToken) {
    const clientId = process.env.MS_CLIENT_ID || '';
    const clientSecret = process.env.MS_CLIENT_SECRET || '';
    const entraTenant = process.env.MS_TENANT_ID || '';
    if (clientId && clientSecret && entraTenant) {
      try {
        const res = await fetch(`${MS_LOGIN_HOST}/${encodeURIComponent(entraTenant)}/oauth2/v2.0/token`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId, client_secret: clientSecret,
            refresh_token: user.msCalendarRefreshToken,
            grant_type: 'refresh_token',
            scope: MS_CALENDAR_SCOPES,
          }),
        });
        if (res.ok) {
          const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
          await db.update(users).set({
            msCalendarToken: tokens.access_token,
            // Entra rotates refresh tokens — persist the new one when returned.
            ...(tokens.refresh_token ? { msCalendarRefreshToken: tokens.refresh_token } : {}),
            updatedAt: new Date(),
          }).where(and(eq(users.id, userId), eq(users.tenantId, tenantId)));
          return tokens.access_token;
        }
      } catch (err) {
        console.error(`[CALENDAR] Microsoft token refresh failed for user ${userId}:`, err);
      }
    }
  }

  return user.msCalendarToken;
}

export async function syncEventToMicrosoftCalendar(
  db: Database, tenantId: string, userId: string,
  event: { id: string; title: string; description: string | null; startAt: Date; endAt: Date; msEventId: string | null },
) {
  const token = await getFreshMicrosoftCalendarToken(db, tenantId, userId);
  if (!token) return;

  const graphEvent = {
    subject: event.title,
    body: { contentType: 'HTML', content: event.description ?? '' },
    start: { dateTime: event.startAt.toISOString(), timeZone: 'UTC' },
    end: { dateTime: event.endAt.toISOString(), timeZone: 'UTC' },
  };

  if (event.msEventId) {
    // Update existing event
    await fetch(`${MS_GRAPH_API}/me/events/${event.msEventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(graphEvent),
    });
  } else {
    // Create new event
    const res = await fetch(`${MS_GRAPH_API}/me/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(graphEvent),
    });
    if (res.ok) {
      const created = await res.json() as { id: string };
      await db.update(calendarEvents).set({ msEventId: created.id, syncedAt: new Date() })
        .where(eq(calendarEvents.id, event.id));
    }
  }
}

export async function deleteMicrosoftCalendarEvent(db: Database, tenantId: string, userId: string, msEventId: string) {
  const token = await getFreshMicrosoftCalendarToken(db, tenantId, userId);
  if (!token) return;

  await fetch(`${MS_GRAPH_API}/me/events/${msEventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
}
