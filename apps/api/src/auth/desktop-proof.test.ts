import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { validateDesktopRequest, verifyDesktopProof } from './desktop-proof.js';

const verifier = 'a'.repeat(64);
const challenge = createHash('sha256').update(verifier).digest('base64url');
const redirectUri = 'http://127.0.0.1:49200/callback/';
describe('desktop OAuth boundary', () => {
  it('accepts loopback with state and S256 challenge', () => {
    expect(validateDesktopRequest(redirectUri, verifier, challenge)).toBe(true);
    expect(verifyDesktopProof({ redirectUri, challenge }, verifier, redirectUri)).toBe(true);
  });
  it.each(['https://evil.example/callback/', 'http://127.0.0.1:80/callback/', 'http://127.0.0.1:99999/callback/', 'http://127.0.0.1:49200/callback/?next=x', 'http://127.0.0.1.evil.example:49200/callback/'])('rejects redirect %s', uri => {
    expect(validateDesktopRequest(uri, verifier, challenge)).toBe(false);
  });
  it('rejects missing state, wrong verifier and substituted redirect', () => {
    expect(validateDesktopRequest(redirectUri, '', challenge)).toBe(false);
    expect(verifyDesktopProof({ redirectUri, challenge }, 'b'.repeat(64), redirectUri)).toBe(false);
    expect(verifyDesktopProof({ redirectUri, challenge }, verifier, 'http://127.0.0.1:49201/callback/')).toBe(false);
    expect(verifyDesktopProof({ redirectUri, challenge }, undefined, redirectUri)).toBe(false);
  });
});
