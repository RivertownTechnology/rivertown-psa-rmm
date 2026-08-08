import { Queue } from 'bullmq';
import { getQueueConnection } from './connection.js';

export interface PushJobData {
  userId: string;
  tenantId: string;
  notificationId: string;
  type: string;
  title: string;
  body?: string;
  entityType?: string;
  entityId?: string;
}

let pushQueue: Queue<PushJobData> | null = null;

export function getPushQueue(redisUrl?: string): Queue<PushJobData> {
  if (!pushQueue) {
    pushQueue = new Queue<PushJobData>('push', {
      connection: getQueueConnection(redisUrl || process.env.REDIS_URL || 'redis://localhost:6379'),
    });
  }
  return pushQueue;
}
