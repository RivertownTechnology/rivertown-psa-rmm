import IORedis from 'ioredis';

// BullMQ requires maxRetriesPerRequest: null on the connection it's given —
// it manages its own retry/backoff semantics on top of ioredis.
let connection: IORedis | null = null;

export function getQueueConnection(redisUrl: string): IORedis {
  if (!connection) {
    connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  }
  return connection;
}
