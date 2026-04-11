import Redis from 'ioredis';

let redis: Redis | null = null;

export function initRedis(url: string): Redis {
  redis = new Redis(url, { maxRetriesPerRequest: 3, lazyConnect: true });
  redis.connect().catch(err => console.error('[REDIS] Connection failed:', err.message));
  return redis;
}

export function getRedis(): Redis | null {
  return redis;
}

/**
 * Add a JWT's JTI to the blacklist with a TTL matching the token's remaining lifetime.
 */
export async function blacklistToken(jti: string, expiresAt: number): Promise<void> {
  if (!redis) return;
  const ttl = Math.max(1, Math.ceil((expiresAt * 1000 - Date.now()) / 1000));
  await redis.set(`bl:${jti}`, '1', 'EX', ttl);
}

/**
 * Check if a JWT's JTI has been blacklisted (i.e., user logged out).
 */
export async function isTokenBlacklisted(jti: string): Promise<boolean> {
  if (!redis) return false;
  const result = await redis.exists(`bl:${jti}`);
  return result === 1;
}
