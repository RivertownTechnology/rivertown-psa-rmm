import { describe, it, expect } from 'vitest';
import { diffChanges } from './audit.js';

describe('diffChanges', () => {
  it('detects changed fields', () => {
    const before = { name: 'Old', email: 'old@test.com', status: 'active' };
    const after = { name: 'New', email: 'new@test.com' };

    const result = diffChanges(before, after);
    expect(result).toEqual({
      name: { old: 'Old', new: 'New' },
      email: { old: 'old@test.com', new: 'new@test.com' },
    });
  });

  it('returns undefined when nothing changed', () => {
    const before = { name: 'Same', status: 'active' };
    const after = { name: 'Same' };

    const result = diffChanges(before, after);
    expect(result).toBeUndefined();
  });

  it('detects numeric changes (e.g., monetary values in cents)', () => {
    const before = { amountCents: 5000, description: 'Service' };
    const after = { amountCents: 7500 };

    const result = diffChanges(before, after);
    expect(result).toEqual({
      amountCents: { old: 5000, new: 7500 },
    });
  });

  it('detects changes from a value to null', () => {
    const before = { notes: 'Some notes', status: 'active' };
    const after = { notes: null as unknown as string };

    const result = diffChanges(before, after);
    expect(result).toEqual({
      notes: { old: 'Some notes', new: null },
    });
  });

  it('handles empty after object', () => {
    const before = { name: 'Test' };
    const after = {};

    const result = diffChanges(before, after);
    expect(result).toBeUndefined();
  });

  it('includes only changed fields, not unchanged ones', () => {
    const before = { a: 1, b: 2, c: 3 };
    const after = { a: 1, b: 99, c: 3 };

    const result = diffChanges(before, after);
    expect(result).toEqual({ b: { old: 2, new: 99 } });
  });
});
