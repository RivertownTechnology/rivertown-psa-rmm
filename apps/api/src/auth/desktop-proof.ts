import { createHash, timingSafeEqual } from 'crypto';

export function validateDesktopRequest(redirectUri?: string, clientState?: string, challenge?: string) {
  if (!redirectUri || !/^http:\/\/127\.0\.0\.1:[0-9]+\/callback\/$/.test(redirectUri)) return false;
  const port = Number(redirectUri.match(/:([0-9]+)\//)?.[1]);
  return port >= 1024 && port <= 65535 &&
    typeof clientState === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(clientState) &&
    typeof challenge === 'string' && /^[A-Za-z0-9_-]{43}$/.test(challenge);
}

export function verifyDesktopProof(expected: { redirectUri: string; challenge: string }, verifier?: string, redirectUri?: string) {
  if (typeof verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(verifier) || redirectUri !== expected.redirectUri) return false;
  const actual = createHash('sha256').update(verifier).digest('base64url');
  return actual.length === expected.challenge.length && timingSafeEqual(Buffer.from(actual), Buffer.from(expected.challenge));
}
