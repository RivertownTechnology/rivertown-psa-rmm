import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

/**
 * Encrypt plaintext using AES-256-GCM.
 * Returns "iv:ciphertext:tag" (all base64-encoded).
 */
export function encrypt(plaintext: string, keyHex: string): string {
  const key = Buffer.from(keyHex, 'hex');
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${encrypted.toString('base64')}:${tag.toString('base64')}`;
}

/**
 * Decrypt an "iv:ciphertext:tag" blob back to plaintext.
 */
export function decrypt(blob: string, keyHex: string): string {
  const parts = blob.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted data format');
  const iv = Buffer.from(parts[0], 'base64');
  const encrypted = Buffer.from(parts[1], 'base64');
  const tag = Buffer.from(parts[2], 'base64');
  const key = Buffer.from(keyHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

/**
 * Check if a value looks like it's already encrypted (iv:ciphertext:tag format).
 */
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const parts = value.split(':');
  return parts.length === 3 && parts.every(p => p.length > 0);
}

/**
 * Encrypt a credentials object. Returns the encrypted string.
 */
export function encryptCredentials(creds: Record<string, unknown>, keyHex: string): string {
  return encrypt(JSON.stringify(creds), keyHex);
}

/**
 * Decrypt credentials. If already a plain object (not encrypted), return as-is.
 */
export function decryptCredentials(value: unknown, keyHex: string | undefined): Record<string, unknown> {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && keyHex) {
    try {
      return JSON.parse(decrypt(value, keyHex));
    } catch {
      return {};
    }
  }
  return {};
}
