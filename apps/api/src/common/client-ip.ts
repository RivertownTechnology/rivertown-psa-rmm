import type { FastifyRequest } from 'fastify';

const PRIVATE_IP = /^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.|::1$|fc|fd|fe80:)/i;

/**
 * Best-effort public client IP for e-signature records.
 *
 * Behind Traefik + nginx the X-Forwarded-For chain looks like
 * "client, traefik" — request.ip (leftmost with trustProxy) is normally right,
 * but if an internal hop ends up first (or a middlebox rewrites the chain),
 * prefer the first PUBLIC address anywhere in the chain. When every hop is
 * private (e.g. signing from inside the office LAN via NAT hairpin), fall back
 * to request.ip — that genuinely is the client's address as seen by the server.
 */
export function clientIp(request: FastifyRequest): string {
  const xff = request.headers['x-forwarded-for'];
  const chain = (Array.isArray(xff) ? xff.join(',') : xff ?? '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  const firstPublic = chain.find(ip => !PRIVATE_IP.test(ip));
  return firstPublic ?? request.ip;
}
