import IORedis from 'ioredis';
import type { WebSocket } from '@fastify/websocket';

export interface WsBroadcastPayload {
  type: string;
  ticketId: string;
}

const REDIS_CHANNEL = 'rivertown:ws:broadcast';

const tenantSockets = new Map<string, Set<WebSocket>>();

let publisher: IORedis | null = null;
let subscriber: IORedis | null = null;

// Fans broadcasts out across every API instance via Redis pub/sub. Each
// instance (including the one that originated the event) receives its own
// publish back through the subscription and delivers it to its local
// sockets only — so this is correct whether the API runs as 1 replica or N,
// with no special-casing needed either way.
export function initWsBroadcast(redisUrl: string) {
  if (publisher) return;

  publisher = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  publisher.on('error', (err) => console.error('[WS] Redis publisher error:', err.message));

  // A subscribed connection can't run other commands, so this must be a
  // separate connection from the publisher.
  subscriber = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  subscriber.on('error', (err) => console.error('[WS] Redis subscriber error:', err.message));
  subscriber.subscribe(REDIS_CHANNEL).catch((err) => console.error('[WS] Redis subscribe failed:', err.message));

  subscriber.on('message', (channel, message) => {
    if (channel !== REDIS_CHANNEL) return;
    try {
      const { tenantId, payload } = JSON.parse(message) as { tenantId: string; payload: WsBroadcastPayload };
      deliverLocal(tenantId, payload);
    } catch (err) {
      console.error('[WS] Failed to parse broadcast message:', err);
    }
  });
}

export function registerSocket(tenantId: string, socket: WebSocket) {
  let set = tenantSockets.get(tenantId);
  if (!set) {
    set = new Set();
    tenantSockets.set(tenantId, set);
  }
  set.add(socket);

  socket.on('close', () => {
    set!.delete(socket);
    if (set!.size === 0) tenantSockets.delete(tenantId);
  });
}

function deliverLocal(tenantId: string, payload: WsBroadcastPayload) {
  const set = tenantSockets.get(tenantId);
  if (!set || set.size === 0) return;
  const frame = JSON.stringify(payload);
  for (const socket of set) {
    if (socket.readyState === socket.OPEN) {
      socket.send(frame);
    }
  }
}

// Broadcasts a JSON frame to every socket connected for the given tenant.
// Never includes ticket content — ids only; clients re-fetch via REST.
export function broadcastToTenant(tenantId: string, payload: WsBroadcastPayload) {
  if (!publisher) {
    // Redis fan-out not initialized (e.g. unit tests) — deliver directly.
    deliverLocal(tenantId, payload);
    return;
  }
  publisher.publish(REDIS_CHANNEL, JSON.stringify({ tenantId, payload }))
    .catch((err) => console.error('[WS] Failed to publish broadcast:', err.message));
}
