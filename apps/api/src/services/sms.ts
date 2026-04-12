/**
 * SMS service — Twilio integration.
 * Credentials pulled from integrationConfigs (provider='twilio') per-tenant.
 * Falls back to TWILIO_* env vars if no per-tenant config (dev mode).
 * If neither configured, logs to console (placeholder mode).
 */
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { readCredentials } from '../common/credentials.js';

export interface SmsSendOptions {
  to: string; // E.164 format, e.g. +18435551234
  message: string;
}

async function getTwilioConfig(db: Database | undefined, tenantId: string | undefined):
  Promise<{ accountSid: string; authToken: string; fromNumber: string } | null> {
  // Try DB first if tenant provided
  if (db && tenantId) {
    const [config] = await db.select().from(integrationConfigs)
      .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'twilio')))
      .limit(1);
    if (config?.isEnabled) {
      const creds = readCredentials(config.credentials);
      const accountSid = (creds.accountSid as string) || '';
      const authToken = (creds.authToken as string) || '';
      const fromNumber = (creds.fromNumber as string) || '';
      if (accountSid && authToken && fromNumber) {
        return { accountSid, authToken, fromNumber };
      }
    }
  }

  // Fall back to env vars
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  if (accountSid && authToken && fromNumber) {
    return { accountSid, authToken, fromNumber };
  }

  return null;
}

export async function sendSms(options: SmsSendOptions, db?: Database, tenantId?: string): Promise<{ success: boolean; error?: string }> {
  // Validate phone format (E.164)
  if (!/^\+[1-9]\d{6,14}$/.test(options.to)) {
    return { success: false, error: 'Invalid phone number format (must be E.164, e.g. +18435551234)' };
  }

  const twilio = await getTwilioConfig(db, tenantId);

  // Dev/placeholder mode — no Twilio configured
  if (!twilio) {
    console.log(`[SMS-PLACEHOLDER] Would send to ${options.to}: ${options.message}`);
    return { success: true };
  }
  const { accountSid, authToken, fromNumber } = twilio;

  // Real Twilio send via REST API (no SDK dependency)
  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        To: options.to,
        From: fromNumber,
        Body: options.message,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('[SMS] Twilio send failed:', errText.substring(0, 300));
      return { success: false, error: 'SMS send failed' };
    }

    return { success: true };
  } catch (err) {
    console.error('[SMS] Send error:', err);
    return { success: false, error: 'SMS send error' };
  }
}

/**
 * Generate a 6-digit numeric code for SMS verification.
 */
export function generateSmsCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
