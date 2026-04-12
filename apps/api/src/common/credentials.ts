/**
 * Encrypted credential helpers for integration configs.
 * When ENCRYPTION_KEY is set, credentials are stored encrypted in the DB.
 * When not set, credentials are stored as plain JSON (backwards compatible).
 */
import { encryptCredentials, decryptCredentials, decrypt } from './encryption.js';

const getKey = () => process.env.ENCRYPTION_KEY;

/**
 * Decrypt credentials from an integrationConfigs row.
 * Handles both encrypted (string) and unencrypted (object) formats.
 */
export function readCredentials(raw: unknown): Record<string, unknown> {
  return decryptCredentials(raw, getKey());
}

/**
 * Prepare credentials for a jsonb column. Encrypts to a string if ENCRYPTION_KEY
 * is set, otherwise returns the raw object. Existing integrationConfigs callers
 * rely on this behaviour (jsonb column accepts either).
 */
export function writeCredentials(creds: Record<string, unknown>): Record<string, unknown> | string {
  const key = getKey();
  if (key) return encryptCredentials(creds, key);
  return creds;
}

/**
 * Prepare credentials for a text column. Always returns a string.
 * Used for system_configs where the column is text, not jsonb.
 */
export function writeCredentialsText(creds: Record<string, unknown>): string {
  const key = getKey();
  if (key) return encryptCredentials(creds, key);
  return JSON.stringify(creds);
}

/**
 * Read credentials previously written via writeCredentialsText.
 * Handles both encrypted blobs and plaintext JSON strings.
 */
export function readCredentialsText(raw: string | null | undefined): Record<string, unknown> {
  if (!raw) return {};
  const k = getKey();
  // Encrypted blob format: "iv:ct:tag" (three base64 parts)
  if (k && raw.split(':').length === 3) {
    try {
      return JSON.parse(decrypt(raw, k));
    } catch {
      return {};
    }
  }
  // Fall back to plaintext JSON
  try { return JSON.parse(raw); } catch { return {}; }
}
