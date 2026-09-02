import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock jose so we never fetch a remote JWKS or verify a real signature — we only
// exercise the multi-tenant issuer/tid logic layered on top of jwtVerify.
vi.mock('jose', () => ({
  createRemoteJWKSet: vi.fn(() => ({})),
  jwtVerify: vi.fn(),
}));

import { jwtVerify } from 'jose';
import { validateMultiTenantIdToken } from './microsoft-oauth.js';

const verifyMock = jwtVerify as unknown as Mock;

describe('validateMultiTenantIdToken', () => {
  beforeEach(() => vi.clearAllMocks());

  it('accepts a token from ANY tenant whose issuer matches its own tid', async () => {
    const tid = 'customer-tenant-guid';
    verifyMock.mockResolvedValue({
      payload: {
        oid: 'oid-1',
        tid,
        iss: `https://login.microsoftonline.com/${tid}/v2.0`,
        email: 'user@customer.com',
        name: 'Cust User',
        preferred_username: 'user@customer.com',
      },
    });

    const identity = await validateMultiTenantIdToken('tok', { clientId: 'app-b-client-id' });

    expect(identity.tid).toBe(tid);
    expect(identity.oid).toBe('oid-1');
    expect(identity.email).toBe('user@customer.com');
    // Audience (App B client id) is enforced; issuer is NOT pinned (multi-tenant).
    expect(verifyMock).toHaveBeenCalledWith(
      'tok',
      expect.anything(),
      expect.objectContaining({ audience: 'app-b-client-id' }),
    );
    expect((verifyMock.mock.calls[0][2] as Record<string, unknown>).issuer).toBeUndefined();
  });

  it('rejects a token whose issuer does not match its tid claim', async () => {
    verifyMock.mockResolvedValue({
      payload: {
        oid: 'oid-1',
        tid: 'tenant-A',
        iss: 'https://login.microsoftonline.com/tenant-B/v2.0', // mismatch
        email: 'user@customer.com',
      },
    });

    await expect(
      validateMultiTenantIdToken('tok', { clientId: 'app-b-client-id' }),
    ).rejects.toThrow(/issuer does not match/i);
  });

  it('rejects a token missing oid/tid claims', async () => {
    verifyMock.mockResolvedValue({ payload: { iss: 'https://login.microsoftonline.com/x/v2.0' } });
    await expect(
      validateMultiTenantIdToken('tok', { clientId: 'app-b-client-id' }),
    ).rejects.toThrow(/missing required oid\/tid/i);
  });

  it('falls back to preferred_username when the email claim is absent', async () => {
    const tid = 't';
    verifyMock.mockResolvedValue({
      payload: {
        oid: 'o',
        tid,
        iss: `https://login.microsoftonline.com/${tid}/v2.0`,
        preferred_username: 'upn@customer.com',
      },
    });

    const identity = await validateMultiTenantIdToken('tok', { clientId: 'app-b-client-id' });
    expect(identity.email).toBe('upn@customer.com');
    expect(identity.preferredUsername).toBe('upn@customer.com');
  });
});
