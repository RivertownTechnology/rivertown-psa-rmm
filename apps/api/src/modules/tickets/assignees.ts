import { and, eq, inArray } from 'drizzle-orm';
import { ticketAssignees } from '@rivertown/db';

/**
 * Ticket assignment is a flat set of techs — there is no primary assignee.
 * Everything that used to read tickets.assignedTo goes through here instead.
 */

/** Assignee user ids for one ticket. */
export async function getAssigneeIds(db: any, tenantId: string, ticketId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: ticketAssignees.userId })
    .from(ticketAssignees)
    .where(and(eq(ticketAssignees.tenantId, tenantId), eq(ticketAssignees.ticketId, ticketId)));
  return rows.map((r: { userId: string }) => r.userId);
}

/**
 * Assignees for many tickets in one query. Used by list endpoints so rendering
 * a page of tickets stays two queries rather than one per row.
 */
export async function getAssigneeMap(
  db: any,
  tenantId: string,
  ticketIds: string[],
): Promise<Record<string, string[]>> {
  const map: Record<string, string[]> = {};
  if (ticketIds.length === 0) return map;
  const rows = await db
    .select({ ticketId: ticketAssignees.ticketId, userId: ticketAssignees.userId })
    .from(ticketAssignees)
    .where(and(eq(ticketAssignees.tenantId, tenantId), inArray(ticketAssignees.ticketId, ticketIds)));
  for (const id of ticketIds) map[id] = [];
  for (const r of rows as Array<{ ticketId: string; userId: string }>) {
    (map[r.ticketId] ??= []).push(r.userId);
  }
  return map;
}

/**
 * Replace a ticket's assignees with exactly `userIds`.
 *
 * Returns the ids that were actually added and removed so callers can notify
 * only the people whose assignment genuinely changed — re-saving a ticket with
 * an unchanged assignee list must not re-notify anyone.
 */
export async function setAssignees(
  db: any,
  tenantId: string,
  ticketId: string,
  userIds: string[],
  assignedBy: string | null,
): Promise<{ added: string[]; removed: string[]; current: string[] }> {
  const desired = Array.from(new Set(userIds.filter(Boolean)));
  const existing = await getAssigneeIds(db, tenantId, ticketId);

  const added = desired.filter(id => !existing.includes(id));
  const removed = existing.filter(id => !desired.includes(id));

  if (added.length > 0) {
    await db
      .insert(ticketAssignees)
      .values(added.map(userId => ({ tenantId, ticketId, userId, assignedBy })))
      .onConflictDoNothing();
  }
  if (removed.length > 0) {
    await db
      .delete(ticketAssignees)
      .where(and(
        eq(ticketAssignees.tenantId, tenantId),
        eq(ticketAssignees.ticketId, ticketId),
        inArray(ticketAssignees.userId, removed),
      ));
  }

  return { added, removed, current: desired };
}

/** Add one tech without disturbing the others. Used by the workflow assign_to action. */
export async function addAssignee(
  db: any,
  tenantId: string,
  ticketId: string,
  userId: string,
  assignedBy: string | null,
): Promise<boolean> {
  const existing = await getAssigneeIds(db, tenantId, ticketId);
  if (existing.includes(userId)) return false;
  await db.insert(ticketAssignees).values({ tenantId, ticketId, userId, assignedBy }).onConflictDoNothing();
  return true;
}
