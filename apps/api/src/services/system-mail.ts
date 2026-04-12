/**
 * System-level email: sent FROM ForgePSA TO tenant owners.
 *
 * Uses the platform Mailjet credentials stored in system_configs (managed
 * from the ForgePSA super-admin dashboard). This is separate from tenant-level
 * email (which MSPs configure in their own settings to email THEIR customers).
 *
 * If Mailjet isn't configured yet, sends are logged and skipped — they do NOT
 * block signup or other flows.
 */
import type { Database } from '@rivertown/db';
import { readSystemConfig } from '../modules/admin/routes.js';

export interface SystemMailOptions {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

interface MailjetConfig {
  apiKey?: string;
  apiSecret?: string;
  fromEmail?: string;
  fromName?: string;
  replyTo?: string;
}

export async function sendSystemEmail(db: Database, options: SystemMailOptions): Promise<boolean> {
  const cfg = (await readSystemConfig(db, 'mailjet')) as MailjetConfig;
  const { apiKey, apiSecret, fromEmail, fromName } = cfg;

  if (!apiKey || !apiSecret || !fromEmail) {
    console.warn('[SYSTEM-MAIL] Mailjet not configured — skipping email', {
      to: options.to, subject: options.subject,
    });
    return false;
  }

  const message: Record<string, unknown> = {
    From: { Email: fromEmail, Name: fromName || 'ForgePSA' },
    To: [{ Email: options.to }],
    Subject: options.subject,
    HTMLPart: options.html,
    TextPart: options.text ?? options.html.replace(/<[^>]*>/g, ''),
  };
  if (options.replyTo || cfg.replyTo) {
    message.ReplyTo = { Email: options.replyTo || cfg.replyTo };
  }

  try {
    const res = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`,
      },
      body: JSON.stringify({ Messages: [message] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[SYSTEM-MAIL] Mailjet ${res.status}:`, errText.slice(0, 500));
      throw new Error(`Mailjet responded ${res.status}`);
    }

    const result = await res.json() as { Messages: Array<{ Status: string }> };
    if (result.Messages?.[0]?.Status === 'success') {
      console.log(`[SYSTEM-MAIL] Sent to=${options.to} subject="${options.subject}"`);
      return true;
    }
    throw new Error(`Mailjet returned status: ${result.Messages?.[0]?.Status}`);
  } catch (err) {
    console.error('[SYSTEM-MAIL] Failed:', err);
    throw err;
  }
}

export interface WelcomeEmailContext {
  to: string;
  firstName: string;
  companyName: string;
  trialEndsAt: Date;
  appUrl?: string; // defaults to https://app.forgepsa.com
}

export async function sendWelcomeEmail(db: Database, ctx: WelcomeEmailContext) {
  const appUrl = ctx.appUrl ?? 'https://app.forgepsa.com';
  const trialDate = ctx.trialEndsAt.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:20px;color:#0f172a">
  <div style="text-align:center;margin-bottom:24px">
    <h1 style="color:#1e3a8a;margin:0;font-size:28px">Welcome to ForgePSA</h1>
  </div>
  <p style="font-size:16px;line-height:1.5">Hi ${escape(ctx.firstName)},</p>
  <p style="font-size:16px;line-height:1.5">
    Your <strong>${escape(ctx.companyName)}</strong> account is live. You've got full access to every
    feature until <strong>${trialDate}</strong> — 45 days, no credit card required.
  </p>
  <div style="text-align:center;margin:32px 0">
    <a href="${appUrl}" style="background:#2563eb;color:#fff;text-decoration:none;padding:12px 28px;border-radius:8px;font-weight:600;font-size:15px">
      Open your dashboard
    </a>
  </div>
  <h3 style="font-size:16px;color:#334155;margin-top:28px">Quick start</h3>
  <ul style="line-height:1.8;color:#475569;font-size:14px">
    <li>Invite your team from <em>Settings → Users</em></li>
    <li>Connect email (Gmail or SMTP) so tickets can come from a shared inbox</li>
    <li>Connect QuickBooks and Pax8 if you use them</li>
    <li>Create your first customer and ticket</li>
  </ul>
  <p style="font-size:14px;color:#64748b;line-height:1.5;margin-top:28px">
    Need help? Reply to this email or reach us at
    <a href="mailto:support@forgepsa.com" style="color:#2563eb">support@forgepsa.com</a>.
  </p>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:28px 0" />
  <p style="font-size:12px;color:#94a3b8;text-align:center">
    ForgePSA · Built by an MSP, for MSPs
  </p>
</div>`;

  const text = `Welcome to ForgePSA

Hi ${ctx.firstName},

Your ${ctx.companyName} account is live. You have full access to every feature until ${trialDate} — 45 days, no credit card required.

Open your dashboard: ${appUrl}

Quick start:
- Invite your team from Settings → Users
- Connect email (Gmail or SMTP)
- Connect QuickBooks and Pax8 if you use them
- Create your first customer and ticket

Need help? support@forgepsa.com

— ForgePSA`;

  return sendSystemEmail(db, {
    to: ctx.to,
    subject: `Welcome to ForgePSA, ${ctx.firstName}`,
    html,
    text,
  });
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
