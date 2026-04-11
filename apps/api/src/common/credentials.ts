/**
 * Encrypted credential helpers for integration configs.
 * When ENCRYPTION_KEY is set, credentials are stored encrypted in the DB.
 * When not set, credentials are stored as plain JSON (backwards compatible).
 */
import { encryptCredentials, decryptCredentials } from './encryption.js';

const getKey = () => process.env.ENCRYPTION_KEY;

/**
 * Decrypt credentials from an integrationConfigs row.
 * Handles both encrypted (string) and unencrypted (object) formats.
 */
export function readCredentials(raw: unknown): Record<string, unknown> {
  return decryptCredentials(raw, getKey());
}

/**
 * Prepare credentials for storage. Encrypts if ENCRYPTION_KEY is set.
 */
export function writeCredentials(creds: Record<string, unknown>): Record<string, unknown> | string {
  const key = getKey();
  if (key) return encryptCredentials(creds, key);
  return creds;
}
