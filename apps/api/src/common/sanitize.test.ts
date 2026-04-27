import { describe, it, expect } from 'vitest';
import { sanitizeBody } from './sanitize.js';

describe('sanitizeBody', () => {
  it('strips id from the body', () => {
    const result = sanitizeBody({ id: 'abc-123', name: 'Acme' });
    expect(result).toEqual({ name: 'Acme' });
    expect('id' in result).toBe(false);
  });

  it('strips tenantId (camelCase)', () => {
    const result = sanitizeBody({ tenantId: 'tid-1', email: 'a@b.com' });
    expect(result).toEqual({ email: 'a@b.com' });
    expect('tenantId' in result).toBe(false);
  });

  it('strips tenant_id (snake_case)', () => {
    const result = sanitizeBody({ tenant_id: 'tid-2', email: 'a@b.com' });
    expect(result).toEqual({ email: 'a@b.com' });
    expect('tenant_id' in result).toBe(false);
  });

  it('strips createdAt (camelCase)', () => {
    const result = sanitizeBody({ createdAt: new Date().toISOString(), name: 'X' });
    expect(result).toEqual({ name: 'X' });
    expect('createdAt' in result).toBe(false);
  });

  it('strips created_at (snake_case)', () => {
    const result = sanitizeBody({ created_at: '2024-01-01', status: 'active' });
    expect(result).toEqual({ status: 'active' });
    expect('created_at' in result).toBe(false);
  });

  it('strips multiple protected fields at once', () => {
    const input = {
      id: '1',
      tenantId: 't1',
      tenant_id: 't2',
      createdAt: 'now',
      created_at: 'now',
      name: 'keep-me',
      amount: 500,
    };
    const result = sanitizeBody(input);
    expect(result).toEqual({ name: 'keep-me', amount: 500 });
  });

  it('preserves all fields that are not protected', () => {
    const input = {
      name: 'Acme Corp',
      email: 'info@acme.com',
      phone: '555-1234',
      notes: 'VIP customer',
      amountCents: 9900,
      isActive: true,
    };
    const result = sanitizeBody(input);
    expect(result).toEqual(input);
  });

  it('returns a new object (does not mutate the original)', () => {
    const input = { id: '1', name: 'Test' };
    const result = sanitizeBody(input);
    // Original should still have id
    expect(input.id).toBe('1');
    expect('id' in result).toBe(false);
  });

  it('handles an empty object', () => {
    const result = sanitizeBody({});
    expect(result).toEqual({});
  });

  it('handles object with only protected fields', () => {
    const result = sanitizeBody({ id: '1', tenantId: '2', createdAt: 'x' });
    expect(result).toEqual({});
  });

  it('does not strip fields on nested objects (shallow sanitization)', () => {
    const input = {
      name: 'Parent',
      child: { id: 'nested-id', tenantId: 'nested-tid', value: 42 },
    };
    const result = sanitizeBody(input);
    // The nested object should be untouched — sanitizeBody operates on the top level only
    expect(result).toEqual({
      name: 'Parent',
      child: { id: 'nested-id', tenantId: 'nested-tid', value: 42 },
    });
  });

  it('handles fields with undefined/null values for protected keys', () => {
    const result = sanitizeBody({ id: undefined, tenantId: null, name: 'X' } as any);
    expect(result).toEqual({ name: 'X' });
    expect('id' in result).toBe(false);
    expect('tenantId' in result).toBe(false);
  });
});
