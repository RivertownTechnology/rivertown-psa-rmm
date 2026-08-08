import { FastifyInstance } from 'fastify';
import { isTokenBlacklisted } from '../common/token-blacklist.js';
import { registerSocket } from './broadcast.js';

const HEARTBEAT_INTERVAL_MS = 30_000;

interface WsTokenPayload {
  jti?: string;
  sub: string;
  tid: string;
  role: string;
  type: string;
}

export async function wsRoutes(fastify: FastifyInstance) {
  // Handles its own auth (native clients can only set Authorization on the
  // upgrade request; browsers can't set headers on WebSocket connect at
  // all, so a ?token= fallback is required) — marked public so the global
  // onRequest auth hook in server.ts doesn't reject query-param-only clients
  // before we get a chance to check either form of the token ourselves.
  fastify.get('/api/v1/ws', { websocket: true, config: { public: true } as any }, async (socket, request) => {
    const authHeader = request.headers.authorization;
    const headerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const queryToken = (request.query as { token?: string } | undefined)?.token;
    const token = headerToken || queryToken;

    if (!token) {
      socket.close(4401, 'Unauthorized');
      return;
    }

    let payload: WsTokenPayload;
    try {
      payload = fastify.jwt.verify<WsTokenPayload>(token);
    } catch {
      socket.close(4401, 'Unauthorized');
      return;
    }

    if (payload.type !== 'access') {
      socket.close(4401, 'Unauthorized');
      return;
    }

    if (payload.jti && (await isTokenBlacklisted(payload.jti))) {
      socket.close(4401, 'Unauthorized');
      return;
    }

    registerSocket(payload.tid, socket);

    // Heartbeat — reap connections that stop responding (dropped wifi, sleeping
    // device, etc.) instead of leaking a broadcast target that's actually dead.
    let isAlive = true;
    socket.on('pong', () => { isAlive = true; });
    const heartbeat = setInterval(() => {
      if (!isAlive) {
        socket.terminate();
        return;
      }
      isAlive = false;
      socket.ping();
    }, HEARTBEAT_INTERVAL_MS);

    socket.on('close', () => clearInterval(heartbeat));
  });
}
