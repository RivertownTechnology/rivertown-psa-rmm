import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import type { Database } from '@rivertown/db';

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
}

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API_URL = 'https://gmail.googleapis.com/gmail/v1';

async function getFreshGmailToken(db: Database, tenantId: string): Promise<{ accessToken: string; fromAddress: string; fromName: string } | null> {
  const [gmailConfig] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'google-email')))
    .limit(1);
  if (!gmailConfig?.isEnabled) return null;

  const creds = gmailConfig.credentials as Record<string, unknown>;
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

  const creds = config.credentials as Record<string, unknown>;
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

function buildRfc2822Message(options: EmailOptions & { fromAddress: string; fromName: string }): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const lines: string[] = [];

  lines.push(`From: "${options.fromName}" <${options.fromAddress}>`);
  lines.push(`To: ${options.to}`);
  lines.push(`Subject: ${options.subject}`);
  lines.push('MIME-Version: 1.0');

  if (options.replyTo) {
    lines.push(`Reply-To: ${options.replyTo}`);
  }

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

  const creds = (config?.credentials as Record<string, unknown>) ?? {};
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

  const creds = (config.credentials as Record<string, unknown>) ?? {};
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

  try {
    const message: Record<string, unknown> = {
      From: { Email: fromAddress, Name: fromName },
      To: [{ Email: options.to }],
      Subject: options.subject,
      HTMLPart: options.html || undefined,
      TextPart: options.text ?? (options.html?.replace(/<[^>]*>/g, '') || undefined),
    };

    if (replyTo) {
      message.ReplyTo = { Email: replyTo };
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
        Authorization: `Basic ${Buffer.from(`${apiKey}:${secretKey}`).toString('base64')}`,
      },
      body: JSON.stringify({ Messages: [message] }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error(`[BILLING-EMAIL] Mailjet API error (${res.status}):`, errText.substring(0, 500));
      return false;
    }

    const result = await res.json() as { Messages: Array<{ Status: string }> };
    const status = result.Messages?.[0]?.Status;
    if (status === 'success') {
      console.log(`[BILLING-EMAIL] Sent successfully to=${options.to}`);
      return true;
    }

    console.error(`[BILLING-EMAIL] Mailjet returned status: ${status}`);
    return false;
  } catch (err) {
    console.error(`[BILLING-EMAIL] Failed to=${options.to}:`, err);
    return false;
  }
}

// Convenience functions for common emails
export async function sendTicketNotification(db: Database, tenantId: string, to: string, ticketNumber: number, subject: string, body: string) {
  return sendEmail(db, tenantId, {
    to,
    subject: `[Ticket #${ticketNumber}] ${subject}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:600px">
      <h2 style="color:#2563eb">Ticket #${ticketNumber}</h2>
      <p>${body}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
      <p style="color:#6b7280;font-size:12px">This is an automated message from Rivertown PSA.</p>
    </div>`,
  });
}

export async function sendQuoteEmail(db: Database, tenantId: string, to: string, quoteNumber: number, title: string, totalCents: number, portalUrl?: string) {
  const total = (totalCents / 100).toFixed(2);
  return sendEmail(db, tenantId, {
    to,
    subject: `Quote #${quoteNumber}: ${title}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:600px">
      <h2 style="color:#2563eb">Quote #${quoteNumber}</h2>
      <p><strong>${title}</strong></p>
      <p style="font-size:24px;font-weight:bold;color:#16a34a">$${total}</p>
      ${portalUrl ? `<p><a href="${portalUrl}" style="color:#2563eb">View and approve in the customer portal</a></p>` : ''}
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
      <p style="color:#6b7280;font-size:12px">This is an automated message from Rivertown PSA.</p>
    </div>`,
  });
}

export async function sendInvoiceEmail(db: Database, tenantId: string, to: string, invoiceNumber: number, totalCents: number, dueDate: string) {
  const total = (totalCents / 100).toFixed(2);
  return sendEmail(db, tenantId, {
    to,
    subject: `Invoice #${invoiceNumber} - $${total} due ${dueDate}`,
    html: `<div style="font-family:system-ui,sans-serif;max-width:600px">
      <h2 style="color:#2563eb">Invoice #${invoiceNumber}</h2>
      <p style="font-size:24px;font-weight:bold">$${total}</p>
      <p>Due: ${dueDate}</p>
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
      <p style="color:#6b7280;font-size:12px">This is an automated message from Rivertown PSA.</p>
    </div>`,
  });
}
