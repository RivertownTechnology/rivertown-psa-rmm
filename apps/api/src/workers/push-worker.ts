import { Worker, Job } from 'bullmq';
import { eq, and, count } from 'drizzle-orm';
import { deviceTokens, notifications, Database } from '@rivertown/db';
import { getQueueConnection } from '../queues/connection.js';
import { PushJobData } from '../queues/push.js';
import { sendApnsPush, ApnsError, ApnsEnvironment } from '../services/apns.js';

export function startPushWorker(db: Database, redisUrl: string): Worker<PushJobData> {
  const worker = new Worker<PushJobData>(
    'push',
    async (job: Job<PushJobData>) => {
      const { userId, notificationId, type, title, body, entityType, entityId } = job.data;

      const tokens = await db.select().from(deviceTokens).where(eq(deviceTokens.userId, userId));
      if (tokens.length === 0) return;

      const [unread] = await db
        .select({ count: count() })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.isRead, false)));
      const badge = unread?.count ?? 0;

      let deliveryFailed = false;

      for (const dt of tokens) {
        try {
          await sendApnsPush({
            deviceToken: dt.token,
            bundleId: dt.bundleId,
            environment: dt.environment as ApnsEnvironment,
            payload: {
              aps: { alert: { title, body }, sound: 'default', badge },
              type,
              entityType,
              entityId,
              notificationId,
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
    },
    { connection: getQueueConnection(redisUrl) },
  );

  worker.on('failed', (job, err) => {
    console.error(`[PUSH] Job ${job?.id} failed:`, err.message);
  });

  return worker;
}
