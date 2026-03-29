import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs } from '@rivertown/db';
import type { Database } from '@rivertown/db';

interface EmailOptions {
  to: string;
  subject: string;
  html?: string;
  text?: string;
  replyTo?: string;
}

export async function getEmailTransporter(db: Database, tenantId: string): Promise<Transporter | null> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
    .limit(1);

  if (!config || !config.isEnabled) return null;

  const creds = config.credentials as Record<string, unknown>;
  const provider = (creds.provider as string) ?? 'smtp';

  // Microsoft 365 OAuth
  if (provider === 'microsoft365' && creds.accessToken) {
    return nodemailer.createTransport({
      host: 'smtp.office365.com',
      port: 587,
      secure: false,
      auth: {
        type: 'OAuth2',
        user: creds.fromAddress as string,
        accessToken: creds.accessToken as string,
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

export async function sendEmail(db: Database, tenantId: string, options: EmailOptions): Promise<boolean> {
  const transporter = await getEmailTransporter(db, tenantId);
  if (!transporter) return false;

  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
    .limit(1);

  const creds = (config?.credentials as Record<string, unknown>) ?? {};
  const fromAddress = (creds.fromAddress as string) ?? 'noreply@localhost';
  const fromName = (creds.fromName as string) ?? 'Rivertown PSA';

  try {
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text ?? options.html?.replace(/<[^>]*>/g, ''),
      replyTo: options.replyTo,
    });
    return true;
  } catch (err) {
    console.error('Email send failed:', err);
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
