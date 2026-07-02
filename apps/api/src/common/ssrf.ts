import { lookup } from 'dns/promises';
import { isIP } from 'net';

// Blocks requests to private, loopback, link-local, and cloud-metadata targets
// so tenant-configured URLs (webhooks, integration base URLs) can't be pointed
// at internal infrastructure (SSRF).

function isPrivateIPv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some(n => Number.isNaN(n))) return true; // treat unparseable as unsafe
  const [a, b] = p;
  if (a === 10) return true;                        // 10.0.0.0/8
  if (a === 127) return true;                       // loopback
  if (a === 0) return true;                         // 0.0.0.0/8
  if (a === 169 && b === 254) return true;          // link-local incl. 169.254.169.254 metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true;          // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === '::1' || lower === '::') return true;      // loopback / unspecified
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique-local fc00::/7
  if (lower.startsWith('fe80')) return true;              // link-local
  if (lower.startsWith('::ffff:')) return isPrivateIPv4(lower.slice(7)); // IPv4-mapped
  return false;
}

function isPrivateAddr(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIPv4(ip);
  if (v === 6) return isPrivateIPv6(ip);
  return true;
}

/**
 * Validate a user/tenant-supplied URL is safe to fetch server-side.
 * Throws with a descriptive message if not. Resolves the hostname and rejects
 * if it maps to any private/loopback/link-local address.
 */
export async function assertPublicHttpUrl(rawUrl: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error('Invalid URL');
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Blocked URL scheme: ${url.protocol}`);
  }

  const host = url.hostname;

  // Literal IP in the URL — check directly
  if (isIP(host)) {
    if (isPrivateAddr(host)) throw new Error('URL resolves to a private address');
    return;
  }

  // Hostname — resolve all addresses and reject if any is private
  let addrs: Array<{ address: string }>;
  try {
    addrs = await lookup(host, { all: true });
  } catch {
    throw new Error(`Could not resolve host: ${host}`);
  }
  if (addrs.length === 0 || addrs.some(a => isPrivateAddr(a.address))) {
    throw new Error('URL resolves to a private address');
  }
}
