import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { readCredentials } from '../common/credentials.js';

interface EmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
  attachments?: EmailAttachment[];
  // Threading headers so replies stay in the same mail conversation
  messageId?: string;
  inReplyTo?: string;
  references?: string;
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1';

/**
 * Resolve the app-only Microsoft Graph credentials + send-from mailbox for a
 * tenant. Reads the `microsoft-email` config row (source of truth) and falls
 * back to MS_* env vars for tenantId/clientId/clientSecret — mirroring the
 * Google env fallback. Returns null when Graph email is not configured.
 */
export async function getMicrosoftEmailAppConfig(db: Database, tenantId: string): Promise<{
  tenantId: string; clientId: string; clientSecret: string;
  fromMailbox: string; fromAddress: string; fromName: string; mailboxes: string[];
} | null> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'microsoft-email')))
    .limit(1);
  if (!config?.isEnabled) return null;

  const creds = readCredentials(config.credentials) as Record<string, unknown>;
  const msTenantId = (creds.tenantId as string) || process.env.MS_TENANT_ID || '';
  const clientId = (creds.clientId as string) || process.env.MS_CLIENT_ID || '';
  const clientSecret = (creds.clientSecret as string) || process.env.MS_CLIENT_SECRET || '';
  const mailboxes = Array.isArray(creds.mailboxes) ? (creds.mailboxes as string[]).filter(Boolean) : [];
  const fromAddress = (creds.fromAddress as string) || mailboxes[0] || '';
  const fromName = (creds.fromName as string) || '';

  if (!msTenantId || !clientId || !clientSecret) return null;
  const fromMailbox = fromAddress || mailboxes[0] || '';
  if (!fromMailbox) return null;

  return { tenantId: msTenantId, clientId, clientSecret, fromMailbox, fromAddress: fromMailbox, fromName, mailboxes };
}

async function getFreshGmailToken(db: Database, tenantId: string): Promise<{ accessToken: string; fromAddress: string; fromName: string } | null> {
  const [gmailConfig] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'google-email')))
    .limit(1);
  if (!gmailConfig?.isEnabled) return null;

  const creds = readCredentials(gmailConfig.credentials);
  const clientId = (creds.clientId as string) || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = (creds.clientSecret as string) || process.env.GOOGLE_CLIENT_SECRET || '';

  const mailboxes = Array.isArray(creds.mailboxes) ? creds.mailboxes as Array<Record<string, unknown>> : [];
  const primary = mailboxes[0] ?? (creds.accessToken ? creds : null);
  if (!primary?.accessToken) return null;

  let accessToken = primary.accessToken as string;
  const refreshToken = primary.refreshToken as string;
  const expiresAt = (primary.expiresAt as number) ?? 0;

  // Refresh if expired or about to expire
  if (expiresAt && Date.now() > expiresAt - 60000 && refreshToken && clientId && clientSecret) {
    try {
      const res = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret,
          refresh_token: refreshToken, grant_type: 'refresh_token',
        }),
      });
      if (res.ok) {
        const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
        accessToken = tokens.access_token;
        if (mailboxes[0]) {
          (mailboxes[0] as Record<string, unknown>).accessToken = tokens.access_token;
          if (tokens.refresh_token) (mailboxes[0] as Record<string, unknown>).refreshToken = tokens.refresh_token;
          (mailboxes[0] as Record<string, unknown>).expiresAt = Date.now() + tokens.expires_in * 1000;
          await db.update(integrationConfigs).set({ credentials: { ...creds, mailboxes }, updatedAt: new Date() })
            .where(eq(integrationConfigs.id, gmailConfig.id));
        }
        // Also update email config
        const [emailCfg] = await db.select().from(integrationConfigs)
          .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
          .limit(1);
        if (emailCfg) {
          await db.update(integrationConfigs).set({
            credentials: { ...(emailCfg.credentials as object), accessToken: tokens.access_token },
            updatedAt: new Date(),
          }).where(eq(integrationConfigs.id, emailCfg.id));
        }
      }
    } catch (err) {
      console.error('[EMAIL] Gmail token refresh failed:', err);
    }
  }

  return {
    accessToken,
    fromAddress: (primary.email as string) || '',
    fromName: (primary.displayName as string) || '',
  };
}

export async function getEmailTransporter(db: Database, tenantId: string): Promise<Transporter | null> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
    .limit(1);

  if (!config || !config.isEnabled) return null;

  const creds = readCredentials(config.credentials);
  const provider = (creds.provider as string) ?? 'smtp';

  // Gmail OAuth2
  if (provider === 'google-email') {
    const gmail = await getFreshGmailToken(db, tenantId);
    if (!gmail) return null;
    return nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: {
        type: 'OAuth2',
        user: gmail.fromAddress,
        accessToken: gmail.accessToken,
      },
    });
  }

  // Standard SMTP
  return nodemailer.createTransport({
    host: creds.smtpHost as string,
    port: (creds.smtpPort as number) ?? 587,
    secure: (creds.smtpPort as number) === 465,
    auth: {
      user: creds.smtpUser as string,
      pass: creds.smtpPassword as string,
    },
    tls: { rejectUnauthorized: creds.useTls !== false },
  });
}

// Header values must not contain CR/LF — an embedded newline would let a
// crafted recipient/subject/name inject arbitrary headers (e.g. a blind Bcc)
// into the raw RFC-2822 message the Gmail API sends verbatim.
function hdr(value: string): string {
  if (/[\r\n]/.test(value)) throw new Error('Invalid email header value');
  return value;
}

function buildRfc2822Message(options: EmailOptions & { fromAddress: string; fromName: string }): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [];

  lines.push(`From: "${hdr(options.fromName)}" <${hdr(options.fromAddress)}>`);
  lines.push(`To: ${hdr(options.to)}`);
  lines.push(`Subject: ${hdr(options.subject)}`);
  lines.push('MIME-Version: 1.0');

  if (options.replyTo) {
    lines.push(`Reply-To: ${hdr(options.replyTo)}`);
  }
  if (options.messageId) lines.push(`Message-ID: ${hdr(options.messageId)}`);
  if (options.inReplyTo) lines.push(`In-Reply-To: ${hdr(options.inReplyTo)}`);
  if (options.references) lines.push(`References: ${hdr(options.references)}`);

  if (options.attachments?.length) {
    lines.push(`Content-Type: multipart/mixed; boundary="${boundary}"`);
    lines.push('');

    // Body part
    lines.push(`--${boundary}`);
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(options.html || options.text || '').toString('base64'));

    // Attachment parts
    for (const att of options.attachments) {
      lines.push(`--${boundary}`);
      lines.push(`Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"`);
      lines.push('Content-Transfer-Encoding: base64');
      lines.push(`Content-Disposition: attachment; filename="${att.filename}"`);
      lines.push('');
      const b64 = typeof att.content === 'string'
        ? Buffer.from(att.content).toString('base64')
        : (att.content as Buffer).toString('base64');
      lines.push(b64);
    }
    lines.push(`--${boundary}--`);
  } else {
    lines.push('Content-Type: text/html; charset=UTF-8');
    lines.push('Content-Transfer-Encoding: base64');
    lines.push('');
    lines.push(Buffer.from(options.html || options.text || '').toString('base64'));
  }

  return lines.join('\r\n');
}

async function sendViaGmailApi(token: string, options: EmailOptions & { fromAddress: string; fromName: string }): Promise<boolean> {
  const rawMessage = buildRfc2822Message(options);
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const res = await fetch(`${GMAIL_API_URL}/users/me/messages/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[EMAIL-SEND] Gmail API send failed (${res.status}):`, err.substring(0, 300));
    return false;
  }
  return true;
}

export async function sendEmail(db: Database, tenantId: string, options: EmailOptions): Promise<boolean> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
    .limit(1);

  if (!config || !config.isEnabled) return false;

  const creds = readCredentials(config?.credentials);
  const provider = (creds.provider as string) ?? 'smtp';

  console.log(`[EMAIL-SEND] Sending to=${options.to} subject="${options.subject}" via ${provider}`);

  try {
    // Use Gmail API (more reliable than SMTP OAuth2)
    if (provider === 'google-email') {
      const gmail = await getFreshGmailToken(db, tenantId);
      if (!gmail) { console.error('[EMAIL-SEND] No Gmail token available'); return false; }
      const sent = await sendViaGmailApi(gmail.accessToken, { ...options, fromAddress: gmail.fromAddress, fromName: gmail.fromName });
      if (sent) console.log(`[EMAIL-SEND] Sent successfully to=${options.to} via Gmail API`);
      return sent;
    }

    // Microsoft Graph (app-only)
    if (provider === 'microsoft-email') {
      const msConfig = await getMicrosoftEmailAppConfig(db, tenantId);
      if (!msConfig) { console.error('[EMAIL-SEND] Microsoft email not configured'); return false; }
      const { sendGraphMail } = await import('./microsoft-graph-mail.js');
      const sent = await sendGraphMail(
        { tenantId: msConfig.tenantId, clientId: msConfig.clientId, clientSecret: msConfig.clientSecret },
        msConfig.fromMailbox,
        options,
      );
      if (sent) console.log(`[EMAIL-SEND] Sent successfully to=${options.to} via Microsoft Graph`);
      return sent;
    }

    // Standard SMTP
    const transporter = await getEmailTransporter(db, tenantId);
    if (!transporter) return false;

    const fromAddress = (creds.fromAddress as string) ?? 'noreply@localhost';
    const fromName = (creds.fromName as string) ?? 'Rivertown PSA';

    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? options.html?.replace(/<[^>]*>/g, ''),
      replyTo: options.replyTo,
      messageId: options.messageId,
      inReplyTo: options.inReplyTo,
      references: options.references,
      attachments: options.attachments?.map(a => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
    });
    console.log(`[EMAIL-SEND] Sent successfully to=${options.to} via SMTP`);
    return true;
  } catch (err) {
    console.error(`[EMAIL-SEND] Failed to=${options.to}:`, err);
    return false;
  }
}

// ===== Unified Mailjet config (one credential, per-document-type senders) =====

/** Document email channels — each can have its own from-address. */
export type MailChannel = 'quotes' | 'agreements' | 'invoices' | 'receipts';

export interface ChannelSender { fromAddress: string; fromName: string; replyTo?: string }

/**
 * Resolves the sender for a channel from the unified `mailjet` config:
 * one API key/secret for the whole account, with per-channel from-addresses
 * under `credentials.senders` and a `default` used for any channel without
 * its own. Returns null when the unified config can't serve the channel —
 * callers then fall back to the legacy sales-email/billing-email configs.
 */
export async function getMailjetChannelSender(
  db: Database, tenantId: string, channel: MailChannel,
): Promise<(ChannelSender & { apiKey: string; secretKey: string }) | null> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'mailjet')))
    .limit(1);
  if (!config?.isEnabled) return null;

  const creds = readCredentials(config.credentials) as Record<string, unknown>;
  const apiKey = creds.apiKey as string;
  const secretKey = creds.secretKey as string;
  if (!apiKey || !secretKey) return null;

  const senders = (creds.senders ?? {}) as Record<string, Partial<ChannelSender>>;
  const sender = senders[channel]?.fromAddress ? senders[channel] : senders.default;
  if (!sender?.fromAddress) return null;

  return {
    apiKey, secretKey,
    fromAddress: sender.fromAddress,
    fromName: sender.fromName || '',
    replyTo: sender.replyTo || undefined,
  };
}

/**
 * Sends a document email on its channel. Prefers the unified Mailjet config;
 * falls back to the legacy per-channel configs (sales-email for quotes and
 * agreements, billing-email for invoices and receipts), which themselves fall
 * back to the general email settings.
 */
export async function sendDocumentEmail(
  db: Database, tenantId: string, channel: MailChannel, options: EmailOptions,
): Promise<boolean> {
  const mj = await getMailjetChannelSender(db, tenantId, channel);
  if (mj) {
    console.log(`[MAILJET:${channel}] Sending to=${options.to} subject="${options.subject}" from=${mj.fromAddress}`);
    return sendViaMailjet(
      { apiKey: mj.apiKey, secretKey: mj.secretKey, fromAddress: mj.fromAddress, fromName: mj.fromName, replyTo: options.replyTo || mj.replyTo },
      options,
      `MAILJET:${channel}`,
    );
  }
  return channel === 'quotes' || channel === 'agreements'
    ? sendSalesEmail(db, tenantId, options)
    : sendBillingEmail(db, tenantId, options);
}

/**
 * Send email using the billing-specific email config via Mailjet Send API v3.1.
 * Uses HTTP API (not SMTP) to avoid port blocking on Railway/cloud hosts.
 * Falls back to the general sendEmail if billing email is not configured.
 */
export async function sendBillingEmail(db: Database, tenantId: string, options: EmailOptions): Promise<boolean> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'billing-email')))
    .limit(1);

  if (!config?.isEnabled) {
    return sendEmail(db, tenantId, options);
  }

  const creds = readCredentials(config.credentials);
  const apiKey = creds.apiKey as string;
  const secretKey = creds.secretKey as string;
  const fromAddress = (creds.fromAddress as string) ?? 'billing@localhost';
  const fromName = (creds.fromName as string) ?? 'Billing';
  const replyTo = options.replyTo || (creds.replyTo as string) || undefined;

  if (!apiKey || !secretKey) {
    console.error('[BILLING-EMAIL] Missing Mailjet API key or secret key');
    return sendEmail(db, tenantId, options);
  }

  console.log(`[BILLING-EMAIL] Sending to=${options.to} subject="${options.subject}" via Mailjet API`);

  return sendViaMailjet(
    { apiKey, secretKey, fromAddress, fromName, replyTo },
    options,
    'BILLING-EMAIL',
  );
}

async function sendViaMailjet(
  sender: { apiKey: string; secretKey: string; fromAddress: string; fromName: string; replyTo?: string },
  options: EmailOptions,
  logPrefix: string,
): Promise<boolean> {
  try {
    const message: Record<string, unknown> = {
      From: { Email: sender.fromAddress, Name: sender.fromName },
      To: [{ Email: options.to }],
      Subject: options.subject,
      HTMLPart: options.html || undefined,
      TextPart: options.text ?? (options.html?.replace(/<[^>]*>/g, '') || undefined),
    };

    if (sender.replyTo) {
      message.ReplyTo = { Email: sender.replyTo };
    }

    if (options.attachments?.length) {
      message.Attachments = options.attachments.map(a => ({
        ContentType: a.contentType || 'application/octet-stream',
        Filename: a.filename,
        Base64Content: typeof a.content === 'string'
          ? Buffer.from(a.content).toString('base64')
          : (a.content as Buffer).toString('base64'),
      }));
    }

    const res = await fetch('https://api.mailjet.com/v3.1/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${sender.apiKey}:${sender.secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({ Messages: [message] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[${logPrefix}] Mailjet API error (${res.status}):`, errText.substring(0, 500));
      return false;
    }

    const result = await res.json() as { Messages: Array<{ Status: string }> };
    const status = result.Messages?.[0]?.Status;
    if (status === 'success') {
      console.log(`[${logPrefix}] Sent successfully to=${options.to}`);
      return true;
    }

    console.error(`[${logPrefix}] Mailjet returned status: ${status}`);
    return false;
  } catch (err) {
    console.error(`[${logPrefix}] Failed to=${options.to}:`, err);
    return false;
  }
}

/**
 * Send email using the sales email config (quotes, agreements, MSAs) via Mailjet.
 * Falls back to the billing email config (which itself falls back to sendEmail)
 * when sales email is not configured.
 */
export async function sendSalesEmail(db: Database, tenantId: string, options: EmailOptions): Promise<boolean> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'sales-email')))
    .limit(1);

  if (!config?.isEnabled) {
    return sendBillingEmail(db, tenantId, options);
  }

  const creds = readCredentials(config.credentials);
  const apiKey = creds.apiKey as string;
  const secretKey = creds.secretKey as string;
  const fromAddress = (creds.fromAddress as string) ?? 'sales@localhost';
  const fromName = (creds.fromName as string) ?? 'Sales';
  const replyTo = options.replyTo || (creds.replyTo as string) || undefined;

  if (!apiKey || !secretKey) {
    console.error('[SALES-EMAIL] Missing Mailjet API key or secret key');
    return sendBillingEmail(db, tenantId, options);
  }

  console.log(`[SALES-EMAIL] Sending to=${options.to} subject="${options.subject}" via Mailjet API`);

  return sendViaMailjet(
    { apiKey, secretKey, fromAddress, fromName, replyTo },
    options,
    'SALES-EMAIL',
  );
}
