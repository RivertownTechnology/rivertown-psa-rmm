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

const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

async function getFreshO365Token(db: Database, tenantId: string): Promise<{ accessToken: string; fromAddress: string; fromName: string } | null> {
  const [m365Config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'microsoft365')))
    .limit(1);
  if (!m365Config?.isEnabled) return null;

  const creds = m365Config.credentials as Record<string, unknown>;
  const clientId = creds.clientId as string;
  const clientSecret = creds.clientSecret as string;

  // Get primary mailbox (first in array, or legacy single format)
  const mailboxes = Array.isArray(creds.mailboxes) ? creds.mailboxes as Array<Record<string, unknown>> : [];
  const primary = mailboxes[0] ?? (creds.accessToken ? creds : null);
  if (!primary?.accessToken) return null;

  let accessToken = primary.accessToken as string;
  const refreshToken = primary.refreshToken as string;
  const expiresAt = (primary.expiresAt as number) ?? 0;

  // Refresh if expired or about to expire
  if (expiresAt && Date.now() > expiresAt - 60000 && refreshToken && clientId && clientSecret) {
    try {
      const res = await fetch(MS_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId, client_secret: clientSecret,
          refresh_token: refreshToken, grant_type: 'refresh_token',
          scope: 'Mail.Read Mail.Send Mail.ReadWrite offline_access',
        }),
      });
      if (res.ok) {
        const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
        accessToken = tokens.access_token;
        // Update stored tokens
        if (mailboxes[0]) {
          (mailboxes[0] as Record<string, unknown>).accessToken = tokens.access_token;
          (mailboxes[0] as Record<string, unknown>).refreshToken = tokens.refresh_token ?? refreshToken;
          (mailboxes[0] as Record<string, unknown>).expiresAt = Date.now() + tokens.expires_in * 1000;
          await db.update(integrationConfigs).set({ credentials: { ...creds, mailboxes }, updatedAt: new Date() })
            .where(eq(integrationConfigs.id, m365Config.id));
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
      console.error('[EMAIL] Token refresh failed:', err);
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

  // Microsoft 365 OAuth — always get fresh token
  if (provider === 'microsoft365') {
    const o365 = await getFreshO365Token(db, tenantId);
    if (!o365) return null;
    return nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: o365.fromAddress,
        accessToken: o365.accessToken,
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

const GRAPH_SEND_URL = 'https://graph.microsoft.com/v1.0/me/sendMail';

async function sendViaGraph(token: string, options: EmailOptions & { fromAddress: string }): Promise<boolean> {
  const message: Record<string, unknown> = {
    subject: options.subject,
    body: {
      contentType: 'HTML',
      content: options.html || options.text || '',
    },
    toRecipients: [{ emailAddress: { address: options.to } }],
  };

  if (options.attachments?.length) {
    message.attachments = options.attachments.map(a => ({
      '@odata.type': '#microsoft.graph.fileAttachment',
      name: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBytes: typeof a.content === 'string'
        ? Buffer.from(a.content).toString('base64')
        : (a.content as Buffer).toString('base64'),
    }));
  }

  const res = await fetch(GRAPH_SEND_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, saveToSentItems: true }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[EMAIL-SEND] Graph API send failed (${res.status}):`, err.substring(0, 300));
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
    // Use Microsoft Graph API for O365 (much more reliable than SMTP AUTH)
    if (provider === 'microsoft365') {
      const o365 = await getFreshO365Token(db, tenantId);
      if (!o365) { console.error('[EMAIL-SEND] No O365 token available'); return false; }
      const sent = await sendViaGraph(o365.accessToken, { ...options, fromAddress: o365.fromAddress });
      if (sent) console.log(`[EMAIL-SEND] Sent successfully to=${options.to} via Graph API`);
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
