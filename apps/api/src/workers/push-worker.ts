import { Worker } from 'bullmq';
import { eq, and, count } from 'drizzle-orm';
import { deviceTokens, notifications, tickets, Database } from '@rivertown/db';
import { getQueueConnection } from '../queues/connection.js';
import { PushJobData } from '../queues/push.js';
import { sendApnsPush, ApnsError, ApnsEnvironment, getApplePushConfig } from '../services/apns.js';

const PUSHABLE_ENTITY_TYPES = new Set(['ticket', 'invoice', 'customer']);

// The actual job-processing logic, decoupled from BullMQ's Worker wrapper so
// it can be unit-tested directly with a mock db (BullMQ's Worker requires a
// live Redis connection to invoke a processor at all).
export async function processPushJob(db: Database, data: PushJobData): Promise<void> {
  const { tenantId, userId, title, body, entityType, entityId } = data;

  // The payload contract requires entityType/entityId for deep-linking —
  // notifications without one (e.g. generic workflow alerts) just don't get
  // a push; the in-app notification row still exists either way.
  if (!entityType || !entityId || !PUSHABLE_ENTITY_TYPES.has(entityType)) return;

  const tokens = await db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
  if (tokens.length === 0) return;

  const config = await getApplePushConfig(db, tenantId);
  if (!config) return; // Apple Push not configured for this tenant yet

  const [unread] = await db
    .select({ count: count() })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
  const badge = unread?.count ?? 0;

  // Top-level `title` is the raw entity title (e.g. ticket subject) for the
  // app's own display — distinct from aps.alert.title, which is the system
  // notification banner text. Looked up fresh rather than trusted from the
  // notification row so it's accurate regardless of which code path created
  // the notification.
  let pushTitle = title;
  if (entityType === 'ticket') {
    const [ticket] = await db.select({ subject: tickets.subject }).from(tickets)
      .where(eq(tickets.id, entityId)).limit(1);
    if (ticket) pushTitle = ticket.subject;
  }

  let deliveryFailed = false;

  for (const dt of tokens) {
    try {
      await sendApnsPush({
        config,
        deviceToken: dt.token,
        environment: dt.environment as ApnsEnvironment,
        payload: {
          aps: { alert: { title, body }, sound: 'default', badge },
          entityType: entityType as 'ticket' | 'invoice' | 'customer',
          entityId,
          title: pushTitle,
        },
      });
    } catch (err) {
      if (err instanceof ApnsError && err.shouldRemoveToken) {
        await db.delete(deviceTokens).where(eq(deviceTokens.id, dt.id));
      } else {
        deliveryFailed = true;
        console.error(`[PUSH] Delivery to device ${dt.id} failed:`, err);
      }
    }
  }

  // Surface a failure so BullMQ retries the job — the tokens that already
  // succeeded will just receive a harmless duplicate push on retry.
  if (deliveryFailed) {
    throw new Error(`Push delivery failed for one or more devices of user ${userId}`);
  }
}

export function startPushWorker(db: Database, redisUrl: string): Worker<PushJobData> {
  const worker = new Worker<PushJobData>(
    'push',
    (job) => processPushJob(db, job.data),
    { connection: getQueueConnection(redisUrl) },
  );

  worker.on('failed', (job, err) => {
    console.error(`[PUSH] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
