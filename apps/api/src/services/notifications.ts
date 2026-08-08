import { notifications, users } from '@rivertown/db';
import { eq, and, inArray, ne } from 'drizzle-orm';
import { getPushQueue } from '../queues/push.js';

export async function createNotification(db: any, data: {
  tenantId: string; userId: string; type: string;
  title: string; body?: string; entityType?: string; entityId?: string;
}) {
  const [row] = await db.insert(notifications).values(data).returning();

  // Fire-and-forget: queueing the push job must never hold up notification
  // creation, and delivery itself happens out-of-band in the push worker.
  getPushQueue().add('send', {
    userId: data.userId,
    tenantId: data.tenantId,
    notificationId: row.id,
    type: data.type,
    title: data.title,
    body: data.body,
    entityType: data.entityType,
    entityId: data.entityId,
  }).catch(err => console.error('[PUSH] Failed to enqueue push job:', err));
}

// Fan a notification out to every active internal user (owner/admin/tech) in
// the tenant — portal_user (customer) accounts are never included. Used for
// broadcasts like "new ticket created" where there's no single target user.
export async function notifyTenantStaff(db: any, data: {
  tenantId: string; type: string;
  title: string; body?: string; entityType?: string; entityId?: string;
  roles?: string[]; excludeUserId?: string;
}) {
  const roles = data.roles ?? ['owner', 'admin', 'tech'];
  const conditions = [
    eq(users.tenantId, data.tenantId),
    eq(users.isActive, true),
    inArray(users.role, roles),
  ];
  if (data.excludeUserId) conditions.push(ne(users.id, data.excludeUserId));

  const staff = await db.select({ id: users.id }).from(users).where(and(...conditions));

  await Promise.all(staff.map((u: { id: string }) => createNotification(db, {
    tenantId: data.tenantId,
    userId: u.id,
    type: data.type,
    title: data.title,
    body: data.body,
    entityType: data.entityType,
    entityId: data.entityId,
  })));
}
