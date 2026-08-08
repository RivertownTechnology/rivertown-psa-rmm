import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getApplePushConfig } from './apns.js';

const TENANT_ID = 'tenant-1';

function createMockDb(configRow: Record<string, unknown> | null) {
  return {
    select: (_cols?: unknown) => ({
      from: (_table: unknown) => ({
        where: () => ({
          limit: () => Promise.resolve(configRow ? [configRow] : []),
        }),
      }),
    }),
  };
}

const ENV_KEYS = ['APNS_KEY_P8', 'APNS_P8', 'APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID'] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe('getApplePushConfig', () => {
  it('returns the DB-stored config when enabled with complete credentials', async () => {
    const db = createMockDb({
      isEnabled: true,
      credentials: { keyP8: 'db-key', keyId: 'DBKEY1234', teamId: 'DBTEAM1', bundleId: 'com.forgepsa.app' },
    });

    const config = await getApplePushConfig(db as any, TENANT_ID);

    expect(config).toEqual({ keyP8: 'db-key', keyId: 'DBKEY1234', teamId: 'DBTEAM1', bundleId: 'com.forgepsa.app' });
  });

  it('falls back to env vars when no DB config exists', async () => {
    process.env.APNS_KEY_P8 = 'env-key';
    process.env.APNS_KEY_ID = 'ENVKEY1';
    process.env.APNS_TEAM_ID = '858FT2MTG6';
    process.env.APNS_BUNDLE_ID = 'com.forgepsa.app';

    const db = createMockDb(null);
    const config = await getApplePushConfig(db as any, TENANT_ID);

    expect(config).toEqual({ keyP8: 'env-key', keyId: 'ENVKEY1', teamId: '858FT2MTG6', bundleId: 'com.forgepsa.app' });
  });

  it('falls back to env vars when the DB config exists but is disabled', async () => {
    process.env.APNS_KEY_P8 = 'env-key';
    process.env.APNS_KEY_ID = 'ENVKEY1';
    process.env.APNS_TEAM_ID = '858FT2MTG6';
    process.env.APNS_BUNDLE_ID = 'com.forgepsa.app';

    const db = createMockDb({
      isEnabled: false,
      credentials: { keyP8: 'db-key', keyId: 'DBKEY1234', teamId: 'DBTEAM1', bundleId: 'com.forgepsa.app' },
    });

    const config = await getApplePushConfig(db as any, TENANT_ID);

    expect(config?.keyP8).toBe('env-key');
  });

  it('falls back to env vars when the DB config is missing required fields', async () => {
    process.env.APNS_KEY_P8 = 'env-key';
    process.env.APNS_KEY_ID = 'ENVKEY1';
    process.env.APNS_TEAM_ID = '858FT2MTG6';
    process.env.APNS_BUNDLE_ID = 'com.forgepsa.app';

    const db = createMockDb({
      isEnabled: true,
      credentials: { keyP8: 'db-key' }, // missing keyId/teamId/bundleId
    });

    const config = await getApplePushConfig(db as any, TENANT_ID);

    expect(config?.keyP8).toBe('env-key');
  });

  it('supports the legacy APNS_P8 env var name', async () => {
    process.env.APNS_P8 = 'legacy-env-key';
    process.env.APNS_KEY_ID = 'ENVKEY1';
    process.env.APNS_TEAM_ID = '858FT2MTG6';
    process.env.APNS_BUNDLE_ID = 'com.forgepsa.app';

    const db = createMockDb(null);
    const config = await getApplePushConfig(db as any, TENANT_ID);

    expect(config?.keyP8).toBe('legacy-env-key');
  });

  it('returns null when neither DB nor env config is available', async () => {
    const db = createMockDb(null);
    const config = await getApplePushConfig(db as any, TENANT_ID);
    expect(config).toBeNull();
  });
});
