/**
 * SMS service — placeholder for Twilio integration.
 * When TWILIO_* env vars are set, sends real SMS. Otherwise logs to console (dev mode).
 */

export interface SmsSendOptions {
  to: string; // E.164 format, e.g. +18435551234
  message: string;
}

export async function sendSms(options: SmsSendOptions): Promise<{ success: boolean; error?: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  // Validate phone format (E.164)
  if (!/^\+[1-9]\d{6,14}$/.test(options.to)) {
    return { success: false, error: 'Invalid phone number format (must be E.164, e.g. +18435551234)' };
  }

  // Dev/placeholder mode — no Twilio configured
  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[SMS-PLACEHOLDER] Would send to ${options.to}: ${options.message}`);
    return { success: true };
  }

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
