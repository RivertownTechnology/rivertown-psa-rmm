import { eq, and } from 'drizzle-orm';
import { tickets, contacts, customers, emailTemplates, tenants } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { sendEmail } from './email.js';
import { renderTemplate } from './template-renderer.js';

// Thread separator — inserted at the bottom of every outbound email
// When customers reply, we strip everything below this line
const THREAD_SEPARATOR = `<div style="color:#9ca3af;font-size:11px;margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb">
--- Please reply above this line ---</div>`;

// Get business profile variables for templates
async function getBusinessVars(db: Database, tenantId: string): Promise<Record<string, string>> {
  const [tenant] = await db.select().from(tenants).where(eq(tenants.id, tenantId)).limit(1);
  const s = (tenant?.settings ?? {}) as Record<string, string>;
  return {
    businessName: s.businessName || '',
    businessLogo: s.businessLogo || '',
    businessAddress: s.businessAddress || '',
    businessCity: s.businessCity || '',
    businessState: s.businessState || '',
    businessZip: s.businessZip || '',
    businessPhone: s.businessPhone || '',
    businessEmail: s.businessEmail || '',
  };
}

// Get a template by type, falling back to a simple default
async function getTemplate(db: Database, tenantId: string, templateType: string): Promise<{ subject: string; bodyHtml: string } | null> {
  const [template] = await db.select().from(emailTemplates)
    .where(and(
      eq(emailTemplates.tenantId, tenantId),
      eq(emailTemplates.templateType, templateType),
      eq(emailTemplates.isActive, true),
    ))
    .limit(1);
  return template ? { subject: template.subject, bodyHtml: template.bodyHtml } : null;
}

// Find the customer's contact email for a ticket
async function getTicketRecipient(db: Database, tenantId: string, ticket: { id: string; contactId?: string | null; customerId: string }): Promise<string | null> {
  // Try contact first
  if (ticket.contactId) {
    const [contact] = await db.select({ email: contacts.email }).from(contacts)
      .where(and(eq(contacts.id, ticket.contactId), eq(contacts.tenantId, tenantId)))
      .limit(1);
    if (contact?.email) return contact.email;
  }

  // Try customer billing email
  const [customer] = await db.select({ billingEmail: customers.billingEmail }).from(customers)
    .where(and(eq(customers.id, ticket.customerId), eq(customers.tenantId, tenantId)))
    .limit(1);
  if (customer?.billingEmail) return customer.billingEmail;

  // Fall back to the original sender from the email that created this ticket
  const { emailMessages } = await import('@rivertown/db');
  const [emailMsg] = await db.select({ fromAddress: emailMessages.fromAddress }).from(emailMessages)
    .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.ticketId, ticket.id), eq(emailMessages.direction, 'inbound')))
    .limit(1);
  return emailMsg?.fromAddress || null;
}

// --- Public functions ---

/**
 * Send a "Ticket Created" notification email to the customer
 */
export async function sendTicketCreatedEmail(db: Database, tenantId: string, ticketId: string) {
  const [ticket] = await db.select().from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)))
    .limit(1);
  if (!ticket) return;

  const to = await getTicketRecipient(db, tenantId, ticket);
  if (!to) return;

  const [customer] = await db.select().from(customers)
    .where(eq(customers.id, ticket.customerId)).limit(1);

  let contact = null;
  if (ticket.contactId) {
    const [c] = await db.select().from(contacts).where(eq(contacts.id, ticket.contactId)).limit(1);
    contact = c ?? null;
  }

  const fullAddr = customer ? [customer.address, [customer.city, customer.state].filter(Boolean).join(', '), customer.zip].filter(Boolean).join(' ') : '';
  const contactName = contact ? `${contact.firstName} ${contact.lastName}` : '';

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ticketNumber: String(ticket.ticketNumber),
    ticketSubject: ticket.subject,
    ticketPriority: ticket.priority ?? 'medium',
    ticketStatus: ticket.status,
    ticketDescription: ticket.description ?? '',
    customerName: customer?.name ?? '',
    customerCompany: customer?.name ?? '',
    customerEmail: customer?.billingEmail ?? '',
    customerPhone: customer?.phone ?? '',
    customerAddress: customer?.address ?? '',
    customerCity: customer?.city ?? '',
    customerState: customer?.state ?? '',
    customerZip: customer?.zip ?? '',
    customerFullAddress: fullAddr,
    contactName,
    contactEmail: contact?.email ?? '',
    contactPhone: contact?.phone ?? '',
    contactJobTitle: contact?.jobTitle ?? '',
  };

  const template = await getTemplate(db, tenantId, 'ticket_created');
  if (!template) {
    // Fallback: simple email with ticket number in subject
    await sendEmail(db, tenantId, {
      to,
      subject: `[Ticket #${ticket.ticketNumber}] ${ticket.subject}`,
      html: `<p>Your ticket has been created and assigned #${ticket.ticketNumber}.</p><p>${ticket.description ?? ''}</p>${THREAD_SEPARATOR}`,
    });
    return;
  }

  const subject = renderTemplate(template.subject, vars);
  const bodyHtml = renderTemplate(template.bodyHtml, vars) + THREAD_SEPARATOR;

  await sendEmail(db, tenantId, { to, subject, html: bodyHtml });
}

/**
 * Send a "Tech Reply" notification email to the customer
 */
export async function sendTicketReplyEmail(db: Database, tenantId: string, ticketId: string, commentBody: string) {
  const [ticket] = await db.select().from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)))
    .limit(1);
  if (!ticket) return;

  const to = await getTicketRecipient(db, tenantId, ticket);
  if (!to) return;

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ticketNumber: String(ticket.ticketNumber),
    ticketSubject: ticket.subject,
    commentBody: commentBody.replace(/\n/g, '<br>'),
    contactName: '',
  };

  const template = await getTemplate(db, tenantId, 'ticket_reply');
  if (!template) {
    await sendEmail(db, tenantId, {
      to,
      subject: `Re: [Ticket #${ticket.ticketNumber}] ${ticket.subject}`,
      html: `<p>${commentBody.replace(/\n/g, '<br>')}</p>${THREAD_SEPARATOR}`,
    });
    return;
  }

  const subject = renderTemplate(template.subject, vars);
  const bodyHtml = renderTemplate(template.bodyHtml, vars) + THREAD_SEPARATOR;

  await sendEmail(db, tenantId, { to, subject, html: bodyHtml });
}

/**
 * Send a "Ticket Closed" notification email to the customer
 */
export async function sendTicketClosedEmail(db: Database, tenantId: string, ticketId: string) {
  const [ticket] = await db.select().from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)))
    .limit(1);
  if (!ticket) return;

  const to = await getTicketRecipient(db, tenantId, ticket);
  if (!to) return;

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ticketNumber: String(ticket.ticketNumber),
    ticketSubject: ticket.subject,
  };

  const template = await getTemplate(db, tenantId, 'ticket_closed');
  if (!template) {
    await sendEmail(db, tenantId, {
      to,
      subject: `[Ticket #${ticket.ticketNumber}] Resolved: ${ticket.subject}`,
      html: `<p>Your ticket <strong>${ticket.subject}</strong> has been resolved.</p><p>Reply to reopen.</p>${THREAD_SEPARATOR}`,
    });
    return;
  }

  const subject = renderTemplate(template.subject, vars);
  const bodyHtml = renderTemplate(template.bodyHtml, vars) + THREAD_SEPARATOR;

  await sendEmail(db, tenantId, { to, subject, html: bodyHtml });
}

/**
 * Strip quoted reply text from inbound emails.
 * Removes everything below common reply separators so only the new content is kept.
 * Handles both line-start patterns and inline patterns (Outlook often concatenates without newlines).
 */
export function stripQuotedReply(text: string): string {
  // Find the earliest match among ALL separator patterns and cut there
  const patterns: RegExp[] = [
    /---\s*Please reply above this line\s*---/i,
    /\nOn .+wrote:?\s*\n/,                        // Gmail: "On Mon, Mar 28 Blake wrote:" (on its own line)
    /On .+wrote:?\s*$/m,                           // Gmail: at start of line
    /From:\s*[^\n]*<[^>]+>/,                       // Outlook inline: "From: Name <email>"
    /From:\s*\S+@\S+/,                             // Outlook: "From: email@domain"
    /\n-{2,}\s*Original Message\s*-{2,}/,          // "-- Original Message --"
    /\n-{2,}\s*Forwarded message\s*-{2,}/,         // "-- Forwarded message --"
    /\n_{10,}/,                                     // "_______________"
    /\nSent:\s/,                                    // "Sent: Saturday..."
    /\n>+ /,                                        // "> quoted text"
  ];

  let earliestIdx = text.length;
  for (const p of patterns) {
    const idx = text.search(p);
    if (idx > 0 && idx < earliestIdx) {
      earliestIdx = idx;
    }
  }

  const result = text.substring(0, earliestIdx).trim();
  return result || text;
}
