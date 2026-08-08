import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deviceTokens, notifications, tickets } from '@rivertown/db';
import { ApnsError } from '../services/apns.js';

const sendApnsPush = vi.fn();
const getApplePushConfig = vi.fn();

vi.mock('../services/apns.js', async () => {
  const actual = await vi.importActual<typeof import('../services/apns.js')>('../services/apns.js');
  return {
    ...actual,
    sendApnsPush: (...args: unknown[]) => sendApnsPush(...args),
    getApplePushConfig: (...args: unknown[]) => getApplePushConfig(...args),
  };
});

const { processPushJob } = await import('./push-worker.js');

const TENANT_ID = 'tenant-1';
const USER_ID = 'user-1';
const APPLE_CONFIG = { keyP8: 'key', keyId: 'KEYID', teamId: 'TEAMID', bundleId: 'com.forgepsa.app' };

function baseJobData(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    notificationId: 'notif-1',
    type: 'ticket_assigned',
    title: 'Ticket #1043 assigned to you',
    body: 'Printer offline',
    entityType: 'ticket',
    entityId: 'ticket-1043',
    ...overrides,
  };
}

function createMockDb(opts: {
  tokens?: Array<Record<string, unknown>>;
  unreadCount?: number;
  ticketSubject?: string | null;
  deleted?: string[];
}) {
  const deleted = opts.deleted ?? [];
  return {
    select: (cols?: Record<string, unknown>) => ({
      from: (table: unknown) => ({
        where: (): any => {
          const limitable = {
            limit: () => {
              if (table === tickets) {
                return Promise.resolve(opts.ticketSubject != null ? [{ subject: opts.ticketSubject }] : []);
              }
              return Promise.resolve([]);
            },
          };
          if (table === deviceTokens) return Promise.resolve(opts.tokens ?? []);
          if (table === notifications && cols && 'count' in cols) {
            return Promise.resolve([{ count: opts.unreadCount ?? 0 }]);
          }
          return limitable;
        },
      }),
    }),
    delete: (_table: unknown) => ({
      where: () => {
        // Drizzle's eq() returns an internal SQL AST, not a plain {field,
        // value} pair — rather than parse that, tests just track how many
        // deletes happened (each test here only has one token in play).
        deleted.push('deleted');
        return Promise.resolve();
      },
    }),
  };
}

beforeEach(() => {
  sendApnsPush.mockReset();
  getApplePushConfig.mockReset();
  getApplePushConfig.mockResolvedValue(APPLE_CONFIG);
});

describe('processPushJob', () => {
  it('skips when entityType/entityId are missing', async () => {
    const db = createMockDb({ tokens: [{ id: 'dt-1', token: 'tok', environment: 'sandbox' }] });
    await processPushJob(db as any, baseJobData({ entityType: undefined, entityId: undefined }));
    expect(sendApnsPush).not.toHaveBeenCalled();
  });

  it('skips when entityType is not a pushable type', async () => {
    const db = createMockDb({ tokens: [{ id: 'dt-1', token: 'tok', environment: 'sandbox' }] });
    await processPushJob(db as any, baseJobData({ entityType: 'workflow' }));
    expect(sendApnsPush).not.toHaveBeenCalled();
  });

  it('skips when the user has no device tokens', async () => {
    const db = createMockDb({ tokens: [] });
    await processPushJob(db as any, baseJobData());
    expect(sendApnsPush).not.toHaveBeenCalled();
    expect(getApplePushConfig).not.toHaveBeenCalled();
  });

  it('skips when Apple Push is not configured', async () => {
    getApplePushConfig.mockResolvedValue(null);
    const db = createMockDb({ tokens: [{ id: 'dt-1', token: 'tok', environment: 'sandbox' }] });
    await processPushJob(db as any, baseJobData());
    expect(sendApnsPush).not.toHaveBeenCalled();
  });

  it('sends the exact required payload shape to every device token', async () => {
    sendApnsPush.mockResolvedValue(undefined);
    const db = createMockDb({
      tokens: [
        { id: 'dt-1', token: 'tok-iphone', environment: 'production' },
        { id: 'dt-2', token: 'tok-ipad', environment: 'sandbox' },
      ],
      unreadCount: 5,
      ticketSubject: 'Printer offline',
    });

    await processPushJob(db as any, baseJobData());

    expect(sendApnsPush).toHaveBeenCalledTimes(2);
    const call = sendApnsPush.mock.calls[0][0];
    expect(call.config).toEqual(APPLE_CONFIG);
    expect(call.deviceToken).toBe('tok-iphone');
    expect(call.environment).toBe('production');
    expect(call.payload).toEqual({
      aps: { alert: { title: 'Ticket #1043 assigned to you', body: 'Printer offline' }, sound: 'default', badge: 5 },
      entityType: 'ticket',
      entityId: 'ticket-1043',
      title: 'Printer offline', // resolved from the live ticket record
    });
    expect(sendApnsPush.mock.calls[1][0].environment).toBe('sandbox');
  });

  it('falls back to the notification title when the ticket lookup finds nothing', async () => {
    sendApnsPush.mockResolvedValue(undefined);
    const db = createMockDb({
      tokens: [{ id: 'dt-1', token: 'tok', environment: 'production' }],
      ticketSubject: null,
    });

    await processPushJob(db as any, baseJobData({ title: 'Fallback title' }));

    expect(sendApnsPush.mock.calls[0][0].payload.title).toBe('Fallback title');
  });

  it('deletes the device_tokens row on a 410/BadDeviceToken response and does not throw', async () => {
    sendApnsPush.mockRejectedValue(new ApnsError(410, 'Unregistered', true));
    const deleted: string[] = [];
    const db = createMockDb({
      tokens: [{ id: 'dt-stale', token: 'stale-tok', environment: 'production' }],
      deleted,
    });

    await expect(processPushJob(db as any, baseJobData())).resolves.toBeUndefined();
    expect(deleted).toHaveLength(1);
  });

  it('does not delete the token and rethrows on a non-token error (so BullMQ retries)', async () => {
    sendApnsPush.mockRejectedValue(new Error('network error'));
    const deleted: string[] = [];
    const db = createMockDb({
      tokens: [{ id: 'dt-1', token: 'tok', environment: 'production' }],
      deleted,
    });

    await expect(processPushJob(db as any, baseJobData())).rejects.toThrow();
    expect(deleted).toHaveLength(0);
  });
});
