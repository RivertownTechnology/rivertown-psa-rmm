import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs, contacts, customers, tickets, ticketComments, emailMessages, tenantSequences, tenants } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { stripQuotedReply, sendTicketCreatedEmail } from './email-notifications.js';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

export async function processInboundEmails(db: Database, tenantId: string): Promise<{ processed: number; tickets: number; comments: number; blocked: number }> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
    .limit(1);

  if (!config?.isEnabled) return { processed: 0, tickets: 0, comments: 0, blocked: 0 };

  const creds = config.credentials as Record<string, unknown>;

  // Use Gmail API if Google email is connected, otherwise IMAP
  if (creds.provider === 'google-email') {
    console.log('[EMAIL] Using Gmail API path, accessToken present:', !!creds.accessToken);
    return processViaGmail(db, tenantId);
  }

  if (!creds.smtpHost || !creds.smtpUser) return { processed: 0, tickets: 0, comments: 0, blocked: 0 };
  return processViaImap(db, tenantId, creds);
}

// --- Gmail API path ---
interface MailboxToken { email: string; accessToken: string; }

async function getGmailTokens(db: Database, tenantId: string): Promise<MailboxToken[]> {
  const [gmailConfig] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'google-email')))
    .limit(1);

  if (!gmailConfig?.isEnabled) return [];
  const creds = gmailConfig.credentials as Record<string, unknown>;
  const clientId = (creds.clientId as string) || process.env.GOOGLE_CLIENT_ID || '';
  const clientSecret = (creds.clientSecret as string) || process.env.GOOGLE_CLIENT_SECRET || '';

  const mailboxes = Array.isArray(creds.mailboxes)
    ? (creds.mailboxes as Array<{ email: string; accessToken: string; refreshToken?: string; expiresAt: number }>)
    : [];

  if (!mailboxes.length) return [];

  let updated = false;
  const results: MailboxToken[] = [];

  for (const mb of mailboxes) {
    // Refresh if expired
    if (mb.expiresAt && Date.now() > mb.expiresAt - 60000 && mb.refreshToken && clientId && clientSecret) {
      try {
        const res = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId, client_secret: clientSecret,
            refresh_token: mb.refreshToken, grant_type: 'refresh_token',
          }),
        });
        if (res.ok) {
          const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
          mb.accessToken = tokens.access_token;
          if (tokens.refresh_token) mb.refreshToken = tokens.refresh_token;
          mb.expiresAt = Date.now() + tokens.expires_in * 1000;
          updated = true;
        }
      } catch (err) { console.error(`Gmail token refresh failed for ${mb.email}:`, err); }
    }
    if (mb.accessToken) results.push({ email: mb.email, accessToken: mb.accessToken });
  }

  if (updated) {
    const updatedCreds = { ...creds, mailboxes };
    await db.update(integrationConfigs).set({ credentials: updatedCreds, updatedAt: new Date() })
      .where(eq(integrationConfigs.id, gmailConfig.id));
    // Update email config with primary token
    if (mailboxes[0]) {
      const [emailCfg] = await db.select().from(integrationConfigs)
        .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
        .limit(1);
      if (emailCfg) {
        const eCreds = { ...(emailCfg.credentials as object), accessToken: mailboxes[0].accessToken };
        await db.update(integrationConfigs).set({ credentials: eCreds, updatedAt: new Date() }).where(eq(integrationConfigs.id, emailCfg.id));
      }
    }
  }

  return results;
}

interface GmailMessage {
  id: string;
  threadId: string;
}

interface GmailMessageDetail {
  id: string;
  threadId: string;
  labelIds: string[];
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType: string;
    body?: { data?: string; size: number };
    parts?: Array<{
      mimeType: string;
      body?: { data?: string; size: number };
      parts?: Array<{ mimeType: string; body?: { data?: string } }>;
    }>;
  };
}

function getHeader(msg: GmailMessageDetail, name: string): string {
  return msg.payload.headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseEmailAddress(headerValue: string): { address: string; name: string } {
  // Strip CRLF to prevent header injection
  const sanitized = headerValue.replace(/[\r\n]/g, '');
  // "Display Name <email@example.com>" or just "email@example.com"
  const match = sanitized.match(/^"?([^"<]*)"?\s*<?([^>]+@[^>]+)>?$/);
  if (match) {
    return { name: match[1].trim(), address: match[2].trim().toLowerCase() };
  }
  return { name: '', address: sanitized.trim().toLowerCase() };
}

function decodeBase64Url(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

function extractBody(msg: GmailMessageDetail): { text: string; html?: string } {
  // Simple single-part message
  if (msg.payload.body?.data) {
    const decoded = decodeBase64Url(msg.payload.body.data);
    if (msg.payload.mimeType === 'text/html') return { text: stripHtml(decoded), html: decoded };
    return { text: decoded };
  }

  // Multipart — walk parts to find text/html and text/plain
  let textBody = '';
  let htmlBody: string | undefined;

  function walkParts(parts: GmailMessageDetail['payload']['parts']) {
    if (!parts) return;
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        textBody = decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data) {
        htmlBody = decodeBase64Url(part.body.data);
      } else if (part.mimeType.startsWith('multipart/') && part.parts) {
        walkParts(part.parts as GmailMessageDetail['payload']['parts']);
      }
    }
  }

  walkParts(msg.payload.parts);

  if (!textBody && htmlBody) textBody = stripHtml(htmlBody);
  return { text: textBody, html: htmlBody };
}

async function processViaGmail(db: Database, tenantId: string): Promise<{ processed: number; tickets: number; comments: number; blocked: number }> {
  const tokens = await getGmailTokens(db, tenantId);
  console.log('[EMAIL] Gmail tokens found:', tokens.length, tokens.map(t => t.email));
  if (!tokens.length) return { processed: 0, tickets: 0, comments: 0, blocked: 0 };

  let processed = 0, ticketsCreated = 0, commentsCreated = 0, blockedCount = 0;

  for (const { accessToken: token, email: mailboxEmail } of tokens) {
  try {
    // List unread messages in inbox
    const listRes = await fetch(
      `${GMAIL_API}/users/me/messages?q=is:unread+in:inbox&maxResults=50`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!listRes.ok) {
      const err = await listRes.text();
      console.error(`[EMAIL] Gmail API list failed for ${mailboxEmail}:`, listRes.status, err.substring(0, 500));
      continue;
    }

    const listData = await listRes.json() as { messages?: GmailMessage[]; resultSizeEstimate: number };
    const messages = listData.messages ?? [];
    console.log(`[EMAIL] Found ${messages.length} unread messages for ${mailboxEmail}`);

    for (const { id: msgId } of messages) {
      // Get full message detail
      const msgRes = await fetch(
        `${GMAIL_API}/users/me/messages/${msgId}?format=full`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!msgRes.ok) {
        console.error(`[EMAIL] Gmail API get message ${msgId} failed:`, msgRes.status);
        continue;
      }

      const msg = await msgRes.json() as GmailMessageDetail;

      const fromHeader = getHeader(msg, 'From');
      const { address: fromAddress, name: fromName } = parseEmailAddress(fromHeader);
      const toHeader = getHeader(msg, 'To');
      const { address: toAddress } = parseEmailAddress(toHeader);
      const subject = getHeader(msg, 'Subject') || '(No subject)';
      const messageId = getHeader(msg, 'Message-ID') || msgId;

      if (!fromAddress) continue;

      // Check if already processed
      const [existing] = await db.select().from(emailMessages)
        .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.messageId, messageId)))
        .limit(1);
      if (existing) {
        // Mark as read in Gmail
        await fetch(`${GMAIL_API}/users/me/messages/${msgId}/modify`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        });
        continue;
      }

      const body = extractBody(msg);

      const result = await processEmail(db, tenantId, {
        messageId, fromAddress, fromName: fromName || undefined,
        toAddress,
        subject,
        bodyText: body.text,
        bodyHtml: body.html,
      });

      if (result.blocked) { blockedCount++; }
      else {
        if (result.ticket) ticketsCreated++;
        if (result.comment) commentsCreated++;
      }

      // Mark as read
      await fetch(`${GMAIL_API}/users/me/messages/${msgId}/modify`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      });
      processed++;
    }
  } catch (err) {
    console.error(`Gmail API email processing failed for ${mailboxEmail}:`, err);
  }
  } // end for each mailbox

  return { processed, tickets: ticketsCreated, comments: commentsCreated, blocked: blockedCount };
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// --- IMAP path ---
async function processViaImap(db: Database, tenantId: string, creds: Record<string, unknown>): Promise<{ processed: number; tickets: number; comments: number; blocked: number }> {
  const imapHost = (creds.imapHost as string) ?? (creds.smtpHost as string);
  const imapPort = (creds.imapPort as number) ?? 993;

  let client: ImapFlow;
  try {
    client = new ImapFlow({
      host: imapHost, port: imapPort, secure: true,
      auth: { user: creds.smtpUser as string, pass: creds.smtpPassword as string },
      logger: false,
    });
    await client.connect();
  } catch (err) {
    console.error('IMAP connection failed:', err);
    return { processed: 0, tickets: 0, comments: 0, blocked: 0 };
  }

  let processed = 0, ticketsCreated = 0, commentsCreated = 0, blockedCount = 0;

  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const messages = client.fetch('1:*', { envelope: true, source: true, flags: true, uid: true }, { uid: true });

      for await (const msg of messages) {
        if (msg.flags?.has('\\Seen')) continue;
        if (!msg.source) continue;

        const parsed: ParsedMail = await simpleParser(msg.source) as ParsedMail;
        const fromAddress = parsed.from?.value?.[0]?.address?.toLowerCase();
        const messageId = parsed.messageId;

        if (!fromAddress || !messageId) continue;

        const [existing] = await db.select().from(emailMessages)
          .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.messageId, messageId)))
          .limit(1);
        if (existing) {
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
          continue;
        }

        const toAddr = Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0]?.address : parsed.to?.value?.[0]?.address;
        const result = await processEmail(db, tenantId, {
          messageId, fromAddress,
          fromName: parsed.from?.value?.[0]?.name ?? undefined,
          toAddress: toAddr ?? '',
          subject: parsed.subject ?? '(No subject)',
          bodyText: parsed.text ?? '',
          bodyHtml: (parsed.html || undefined) as string | undefined,
        });

        if (result.blocked) { blockedCount++; }
        else {
          if (result.ticket) ticketsCreated++;
          if (result.comment) commentsCreated++;
        }

        await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
        processed++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return { processed, tickets: ticketsCreated, comments: commentsCreated, blocked: blockedCount };
}

// --- Get or create the "Needs Assignment" fallback customer ---
async function getOrCreateFallbackCustomer(db: Database, tenantId: string): Promise<string> {
  const [existing] = await db.select({ id: customers.id }).from(customers)
    .where(and(eq(customers.tenantId, tenantId), eq(customers.name, 'Needs Assignment')))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db.insert(customers).values({
    tenantId, name: 'Needs Assignment',
    status: 'active',
  }).returning({ id: customers.id });

  return created.id;
}

// --- Get blocked email list ---
async function getBlockedEmails(db: Database, tenantId: string): Promise<string[]> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
    .limit(1);
  if (!config) return [];
  const creds = config.credentials as Record<string, unknown>;
  const blocked = creds.blockedEmails as string[] | undefined;
  return blocked ?? [];
}

// --- Shared email processing logic ---
async function processEmail(db: Database, tenantId: string, email: {
  messageId: string; fromAddress: string; fromName?: string;
  toAddress: string; subject: string; bodyText: string; bodyHtml?: string;
}): Promise<{ ticket: boolean; comment: boolean; blocked: boolean }> {
  // Check blocklist
  const blockedEmails = await getBlockedEmails(db, tenantId);
  const senderLower = email.fromAddress.toLowerCase();
  const senderDomain = senderLower.split('@')[1] ?? '';
  const isBlocked = blockedEmails.some(b => {
    const bl = b.toLowerCase().trim();
    if (!bl) return false;
    if (bl.startsWith('@')) return senderDomain === bl.slice(1);
    return senderLower === bl;
  });

  if (isBlocked) {
    await db.insert(emailMessages).values({
      tenantId, messageId: email.messageId, fromAddress: email.fromAddress,
      fromName: email.fromName, toAddress: email.toAddress, subject: email.subject,
      bodyText: email.bodyText || undefined, bodyHtml: email.bodyHtml || undefined,
      direction: 'inbound', processedAt: new Date(),
    });
    return { ticket: false, comment: false, blocked: true };
  }

  // Match contact by sender email
  let [contact] = await db.select().from(contacts)
    .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, email.fromAddress)))
    .limit(1);

  // Check if this is a reply to an existing ticket (subject contains [Ticket #N])
  const ticketMatch = email.subject.match(/\[Ticket #(\d+)\]/);
  let ticketId: string | undefined;
  let isTicket = false, isComment = false;

  if (ticketMatch) {
    const ticketNumber = parseInt(ticketMatch[1], 10);
    const [existingTicket] = await db.select().from(tickets)
      .where(and(eq(tickets.tenantId, tenantId), eq(tickets.ticketNumber, ticketNumber)))
      .limit(1);

    if (existingTicket) {
      if (!contact && existingTicket.contactId) {
        const [ticketContact] = await db.select().from(contacts)
          .where(eq(contacts.id, existingTicket.contactId)).limit(1);
        if (ticketContact) contact = ticketContact;
      }

      const cleanBody = stripQuotedReply(email.bodyText);
      await db.insert(ticketComments).values({
        tenantId, ticketId: existingTicket.id,
        authorType: contact ? 'contact' : 'system',
        authorId: contact?.id ?? '00000000-0000-0000-0000-000000000000',
        body: cleanBody, isInternal: false,
      });
      ticketId = existingTicket.id;
      isComment = true;

      // Handle auto-reopen/new ticket based on existing ticket status
      if (existingTicket.status === 'resolved') {
        // Auto-reopen resolved tickets on customer reply (if setting enabled)
        const [tenantRow] = await db.select({ settings: tenants.settings })
          .from(tenants).where(eq(tenants.id, tenantId)).limit(1);
        const ts = (tenantRow?.settings ?? {}) as Record<string, unknown>;
        if (ts.ticketAutoReopenOnReply !== false) {
          await db.update(tickets).set({
            status: 'open',
            resolvedAt: null,
            closedAt: null,
            updatedAt: new Date(),
          }).where(eq(tickets.id, existingTicket.id));
        }
      } else if (existingTicket.status === 'closed') {
        // Closed tickets: create a NEW ticket instead of reopening
        const [seq] = await db.select().from(tenantSequences)
          .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket'))).limit(1);
        const nextNumber = parseInt(seq?.currentValue ?? '0', 10) + 1;
        await db.update(tenantSequences).set({ currentValue: String(nextNumber) })
          .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket')));

        await db.insert(tickets).values({
          tenantId,
          ticketNumber: nextNumber,
          customerId: existingTicket.customerId,
          contactId: existingTicket.contactId ?? contact?.id ?? null,
          subject: email.subject?.replace(/\[Ticket #\d+\]\s*/i, '').trim() || `Follow-up: ${existingTicket.subject}`,
          description: `Follow-up from closed Ticket #${existingTicket.ticketNumber}\n\n${cleanBody}`,
          status: 'new',
          priority: 'medium',
          source: 'email',
        });
      }
    }
  }

  if (!ticketId) {
    const customerId = contact
      ? contact.customerId
      : await getOrCreateFallbackCustomer(db, tenantId);

    const [seq] = await db.select().from(tenantSequences)
      .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket')))
      .limit(1);
    const nextNum = parseInt(seq?.currentValue ?? '0', 10) + 1;
    await db.update(tenantSequences).set({ currentValue: String(nextNum) })
      .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket')));

    const senderLabel = email.fromName
      ? `${email.fromName} <${email.fromAddress}>`
      : email.fromAddress;

    const [newTicket] = await db.insert(tickets).values({
      tenantId, ticketNumber: nextNum,
      customerId,
      contactId: contact?.id ?? undefined,
      subject: email.subject.replace(/^(Re:|Fwd?:)\s*/gi, '').trim(),
      description: contact
        ? email.bodyText.substring(0, 5000)
        : `From: ${senderLabel}\n\n${email.bodyText.substring(0, 5000)}`,
      status: 'new', priority: 'medium', ticketType: 'incident', source: 'email',
    }).returning();

    const { calculateSla } = await import('./sla-calculator.js');
    const sla = await calculateSla(db, tenantId, customerId, 'medium', new Date());
    if (sla.slaPolicyId) {
      await db.update(tickets).set({
        slaDueAt: sla.slaDueAt, slaResponseDueAt: sla.slaResponseDueAt,
        slaResolutionDueAt: sla.slaResolutionDueAt, slaPolicyId: sla.slaPolicyId,
      }).where(eq(tickets.id, newTicket.id));
    }

    ticketId = newTicket.id;
    isTicket = true;

    sendTicketCreatedEmail(db, tenantId, newTicket.id).catch(e => console.error('Ticket created email failed:', e));
  }

  // Store email record
  await db.insert(emailMessages).values({
    tenantId, messageId: email.messageId, fromAddress: email.fromAddress,
    fromName: email.fromName, toAddress: email.toAddress, subject: email.subject,
    bodyText: email.bodyText || undefined, bodyHtml: email.bodyHtml || undefined,
    ticketId: ticketId ?? undefined, contactId: contact?.id ?? undefined,
    direction: 'inbound', processedAt: new Date(),
  });

  return { ticket: isTicket, comment: isComment, blocked: false };
}
