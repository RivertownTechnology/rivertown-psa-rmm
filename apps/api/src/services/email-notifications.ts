import crypto from 'crypto';
import { eq, and, desc } from 'drizzle-orm';
import { tickets, ticketComments, contacts, customers, emailTemplates, tenants, users, csatRatings, emailMessages } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { sendEmail } from './email.js';
import { renderTemplate } from './template-renderer.js';
import { resolveAuthorNames } from '../common/author-names.js';

// Build In-Reply-To / References from the ticket's stored email messages so
// outbound replies stay in the same conversation in the customer's (and our) inbox.
async function getTicketThreadHeaders(db: Database, tenantId: string, ticketId: string): Promise<{ inReplyTo?: string; references?: string }> {
  const rows = await db.select({ messageId: emailMessages.messageId })
    .from(emailMessages)
    .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.ticketId, ticketId)))
    .orderBy(emailMessages.createdAt);
  const ids = rows.map(r => r.messageId).filter((m): m is string => !!m);
  if (!ids.length) return {};
  return { inReplyTo: ids[ids.length - 1], references: ids.join(' ') };
}

// Record an outbound email so subsequent replies keep threading.
async function recordOutboundEmail(db: Database, tenantId: string, ticketId: string, fromAddress: string, to: string, subject: string, messageId: string): Promise<void> {
  await db.insert(emailMessages).values({
    tenantId, messageId, fromAddress, toAddress: to, subject,
    ticketId, direction: 'outbound', processedAt: new Date(),
  }).catch(() => { /* ignore duplicate message ids */ });
}

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

  const businessVars = await getBusinessVars(db, tenantId);
  const vars: Record<string, string> = {
    ...businessVars,
    ticketNumber: String(ticket.ticketNumber),
    ticketSubject: ticket.subject,
    commentBody: commentBody.replace(/\n/g, '<br>'),
    contactName: '',
  };

  // Threading: reference the customer's prior messages so Gmail keeps the thread
  const thread = await getTicketThreadHeaders(db, tenantId, ticketId);
  const fromEmail = businessVars.businessEmail || `support@${to.split('@')[1] || 'localhost'}`;
  const domain = fromEmail.split('@')[1] || 'localhost';
  const messageId = `<${crypto.randomUUID()}@${domain}>`;

  const template = await getTemplate(db, tenantId, 'ticket_reply');
  const subject = template
    ? renderTemplate(template.subject, vars)
    : `Re: [Ticket #${ticket.ticketNumber}] ${ticket.subject}`;
  const bodyHtml = (template
    ? renderTemplate(template.bodyHtml, vars)
    : `<p>${commentBody.replace(/\n/g, '<br>')}</p>`) + THREAD_SEPARATOR;

  await sendEmail(db, tenantId, {
    to, subject, html: bodyHtml,
    messageId, inReplyTo: thread.inReplyTo, references: thread.references,
  });
  await recordOutboundEmail(db, tenantId, ticketId, fromEmail, to, subject, messageId);
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

  // Look up CSAT token for this ticket
  const [csatRecord] = await db.select({ token: csatRatings.token })
    .from(csatRatings).where(eq(csatRatings.ticketId, ticketId)).limit(1);
  const apiBaseUrl = process.env.API_BASE_URL || 'https://rivertownapi-production.up.railway.app';
  const csatUrl = csatRecord
    ? `${apiBaseUrl}/api/v1/csat/${csatRecord.token}/page`
    : null;

  const csatHtml = csatUrl
    ? `<div style="text-align:center; margin-top:20px; padding:20px; background:#f9fafb; border-radius:8px;">
  <p style="margin:0 0 12px; font-size:14px; color:#374151;">How was your experience?</p>
  <a href="${csatUrl}" style="text-decoration:none; font-size:28px; padding:0 8px;" title="Rate your experience">
    &#128542; &#128528; &#128522;
  </a>
  <p style="margin:8px 0 0; font-size:12px; color:#9ca3af;">Click to rate your support experience</p>
</div>`
    : '';

  const vars: Record<string, string> = {
    ...await getBusinessVars(db, tenantId),
    ticketNumber: String(ticket.ticketNumber),
    ticketSubject: ticket.subject,
    csatUrl: csatUrl ?? '',
  };

  const template = await getTemplate(db, tenantId, 'ticket_closed');
  if (!template) {
    await sendEmail(db, tenantId, {
      to,
      subject: `[Ticket #${ticket.ticketNumber}] Resolved: ${ticket.subject}`,
      html: `<p>Your ticket <strong>${ticket.subject}</strong> has been resolved.</p><p>Reply to reopen.</p>${csatHtml}${THREAD_SEPARATOR}`,
    });
    return;
  }

  const subject = renderTemplate(template.subject, vars);
  const bodyHtml = renderTemplate(template.bodyHtml, vars) + csatHtml + THREAD_SEPARATOR;

  await sendEmail(db, tenantId, { to, subject, html: bodyHtml });
}

/**
 * Strip quoted reply text from inbound emails.
 * Removes everything below common reply separators so only the new content is kept.
 * Handles both line-start patterns and inline patterns (Outlook often concatenates without newlines).
 */
/**
 * Send a "Ticket Assigned" notification to the assigned tech AND the customer.
 * Includes full ticket context: customer info, contact, discussion thread.
 */
export async function sendTicketAssignedEmail(db: Database, tenantId: string, ticketId: string, assignedById: string) {
  const [ticket] = await db.select().from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId)))
    .limit(1);
  if (!ticket || !ticket.assignedTo) return;

  // Get all the context
  const [customer] = await db.select().from(customers).where(eq(customers.id, ticket.customerId)).limit(1);
  const [assignedTech] = await db.select().from(users).where(eq(users.id, ticket.assignedTo)).limit(1);
  const [assignedBy] = await db.select().from(users).where(eq(users.id, assignedById)).limit(1);

  let contact = null;
  if (ticket.contactId) {
    const [c] = await db.select().from(contacts).where(eq(contacts.id, ticket.contactId)).limit(1);
    contact = c ?? null;
  }

  // Get discussion thread (comments)
  const comments = await db.select().from(ticketComments)
    .where(and(eq(ticketComments.ticketId, ticketId), eq(ticketComments.tenantId, tenantId)))
    .orderBy(desc(ticketComments.createdAt));

  // Resolve comment author names (batched)
  const authorNames = await resolveAuthorNames(db, comments.map(c => c.authorId));

  const contactName = contact ? `${contact.firstName} ${contact.lastName}` : '';
  const contactPhone = contact?.phone || customer?.phone || '';
  const customerAddr = [customer?.address, [customer?.city, customer?.state].filter(Boolean).join(', '), customer?.zip].filter(Boolean).join('\n');
  const now = new Date();
  const dateAssigned = now.toLocaleString('en-US', { weekday: 'short', month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  // Build discussion HTML
  const discussionHtml = comments.length > 0 ? comments.map(c => {
    const name = authorNames[c.authorId] || (c.authorType === 'system' ? 'System' : 'Unknown');
    const date = new Date(c.createdAt).toLocaleString('en-US', { month: 'numeric', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
    const typeLabel = c.isInternal ? '<span style="color:#d97706;font-weight:600">Internal</span>' : '';
    return `<div style="margin-bottom:12px;padding-bottom:12px;border-bottom:1px solid #e5e7eb">
      <div style="font-weight:600;font-size:13px">${name} ${typeLabel}</div>
      <div style="font-size:11px;color:#9ca3af">${date}</div>
      <div style="margin-top:4px;font-size:13px;white-space:pre-wrap">${c.body}</div>
    </div>`;
  }).join('') : '<div style="color:#9ca3af;font-size:13px">No discussion yet.</div>';

  const businessVars = await getBusinessVars(db, tenantId);

  const html = `<div style="font-family:system-ui,-apple-system,sans-serif;max-width:600px;margin:0 auto">
    <div style="border-bottom:2px solid #2563eb;padding:16px 0;margin-bottom:24px">
      <strong style="font-size:18px;color:#111">${businessVars.businessName}</strong>
    </div>

    <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:13px;color:#1e40af">
      --- REPLY above this line to respond ---
    </div>

    <p style="margin:0 0 16px;color:#111">Your schedule for this ticket has been updated.</p>

    <h3 style="margin:0 0 12px;color:#111">Summary:</h3>
    <div style="font-weight:600;font-size:15px;margin-bottom:16px">${ticket.subject}</div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;font-size:13px">
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;width:120px;vertical-align:top">Status:</td><td style="padding:6px 0;font-weight:500">${ticket.status}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Ticket #</td><td style="padding:6px 0">${ticket.ticketNumber}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Company:</td><td style="padding:6px 0">${customer?.name || ''}</td></tr>
      ${contactName ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Contact:</td><td style="padding:6px 0">${contactName}</td></tr>` : ''}
      ${contactPhone ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Phone:</td><td style="padding:6px 0">${contactPhone}</td></tr>` : ''}
      ${customerAddr ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Address:</td><td style="padding:6px 0;white-space:pre-line">${customerAddr}</td></tr>` : ''}
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Assigned To:</td><td style="padding:6px 0;font-weight:500">${assignedTech?.displayName || 'Unassigned'}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Assigned By:</td><td style="padding:6px 0">${assignedBy?.displayName || ''}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Date Assigned:</td><td style="padding:6px 0">${dateAssigned}</td></tr>
      <tr><td style="padding:6px 12px 6px 0;color:#6b7280;vertical-align:top">Priority:</td><td style="padding:6px 0">${ticket.priority}</td></tr>
    </table>

    <h3 style="margin:16px 0 12px;color:#111;border-top:2px solid #e5e7eb;padding-top:16px">Discussion</h3>
    ${discussionHtml}

    <div style="border-top:1px solid #e5e7eb;margin-top:24px;padding-top:16px;font-size:12px;color:#6b7280">
      <p>${businessVars.businessName}</p>
      <p>${businessVars.businessAddress} ${businessVars.businessCity}, ${businessVars.businessState} ${businessVars.businessZip}</p>
      <p>${businessVars.businessPhone} | ${businessVars.businessEmail}</p>
    </div>
  </div>${THREAD_SEPARATOR}`;

  const subject = `[Ticket #${ticket.ticketNumber}] Assigned: ${ticket.subject}`;

  // Send to assigned tech
  if (assignedTech?.email) {
    await sendEmail(db, tenantId, { to: assignedTech.email, subject, html });
  }

  // Also send to customer contact
  const customerTo = await getTicketRecipient(db, tenantId, ticket);
  if (customerTo && customerTo !== assignedTech?.email) {
    await sendEmail(db, tenantId, { to: customerTo, subject, html });
  }
}

export function stripQuotedReply(text: string): string {
  // Find the earliest match among ALL separator patterns and cut there
  const patterns: RegExp[] = [
    /---\s*Please reply above this line\s*---/i,
    // Gmail attribution: "On <date> <name> <email> wrote:" — wraps across lines
    // when longer than ~76 chars, so allow newlines between "On" and "wrote:".
    /(?:^|\n)[ \t>]*On\s[\s\S]{5,400}?\bwrote:/,
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
