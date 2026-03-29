import { eq } from 'drizzle-orm';
import { users, calendarEvents } from '@rivertown/db';
import type { Database } from '@rivertown/db';

const GRAPH_API_URL = 'https://graph.microsoft.com/v1.0';

export async function syncEventToM365(
  db: Database, tenantId: string, userId: string,
  event: { id: string; title: string; description: string | null; startAt: Date; endAt: Date; m365EventId: string | null },
) {
  const [user] = await db.select({
    m365CalendarConnected: users.m365CalendarConnected,
    m365CalendarToken: users.m365CalendarToken,
  }).from(users).where(eq(users.id, userId)).limit(1);

  if (!user?.m365CalendarConnected || !user.m365CalendarToken) return;

  const graphEvent = {
    subject: event.title,
    body: { contentType: 'text', content: event.description ?? '' },
    start: { dateTime: event.startAt.toISOString(), timeZone: 'UTC' },
    end: { dateTime: event.endAt.toISOString(), timeZone: 'UTC' },
  };

  if (event.m365EventId) {
    // Update existing event
    await fetch(`${GRAPH_API_URL}/me/calendar/events/${event.m365EventId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${user.m365CalendarToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(graphEvent),
    });
  } else {
    // Create new event
    const res = await fetch(`${GRAPH_API_URL}/me/calendar/events`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${user.m365CalendarToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(graphEvent),
    });
    if (res.ok) {
      const created = await res.json() as { id: string };
      await db.update(calendarEvents).set({ m365EventId: created.id, syncedAt: new Date() })
        .where(eq(calendarEvents.id, event.id));
    }
  }
}

export async function deleteM365Event(db: Database, userId: string, m365EventId: string) {
  const [user] = await db.select({ m365CalendarToken: users.m365CalendarToken })
    .from(users).where(eq(users.id, userId)).limit(1);
  if (!user?.m365CalendarToken) return;

  await fetch(`${GRAPH_API_URL}/me/calendar/events/${m365EventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${user.m365CalendarToken}` },
  });
}
