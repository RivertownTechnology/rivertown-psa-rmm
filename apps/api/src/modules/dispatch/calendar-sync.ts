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
