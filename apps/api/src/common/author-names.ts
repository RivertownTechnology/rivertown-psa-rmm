import { inArray } from 'drizzle-orm';
import { users, contacts } from '@rivertown/db';

const SYSTEM_AUTHOR_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Resolve a set of author ids (which may be users or contacts) to display names
 * in two batched queries instead of N sequential per-id selects.
 * Returns a map of authorId -> display name.
 */
export async function resolveAuthorNames(
  db: any,
  ids: (string | null | undefined)[],
): Promise<Record<string, string>> {
  const uniqueIds = [...new Set(
    ids.filter((id): id is string => Boolean(id) && id !== SYSTEM_AUTHOR_ID),
  )];
  const nameMap: Record<string, string> = {};
  if (uniqueIds.length === 0) return nameMap;

  const userRows = await db
    .select({ id: users.id, displayName: users.displayName })
    .from(users)
    .where(inArray(users.id, uniqueIds));
  for (const u of userRows) nameMap[u.id] = u.displayName;

  const remaining = uniqueIds.filter(id => !(id in nameMap));
  if (remaining.length > 0) {
    const contactRows = await db
      .select({ id: contacts.id, firstName: contacts.firstName, lastName: contacts.lastName })
      .from(contacts)
      .where(inArray(contacts.id, remaining));
    for (const c of contactRows) nameMap[c.id] = `${c.firstName} ${c.lastName}`;
  }

  return nameMap;
}
