import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs, contacts, customers, tickets, ticketComments, emailMessages, tenantSequences } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { stripQuotedReply, sendTicketCreatedEmail } from './email-notifications.js';

const GRAPH_API = 'https://graph.microsoft.com/v1.0';
const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';

export async function processInboundEmails(db: Database, tenantId: string): Promise<{ processed: number; tickets: number; comments: number; blocked: number }> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
    .limit(1);

  if (!config?.isEnabled) return { processed: 0, tickets: 0, comments: 0, blocked: 0 };

  const creds = config.credentials as Record<string, unknown>;

  // Use Microsoft Graph if O365 is connected, otherwise IMAP
  if (creds.provider === 'microsoft365') {
    console.log('[EMAIL] Using Graph API path, accessToken present:', !!creds.accessToken);
    return processViaGraph(db, tenantId);
  }

  if (!creds.smtpHost || !creds.smtpUser) return { processed: 0, tickets: 0, comments: 0, blocked: 0 };
  return processViaImap(db, tenantId, creds);
}

// --- Microsoft Graph API path ---
interface MailboxToken { email: string; accessToken: string; }

async function getGraphTokens(db: Database, tenantId: string): Promise<MailboxToken[]> {
  const [m365Config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'microsoft365')))
    .limit(1);

  if (!m365Config?.isEnabled) return [];
  const creds = m365Config.credentials as Record<string, unknown>;
  const clientId = creds.clientId as string;
  const clientSecret = creds.clientSecret as string;

  // Support both array and legacy single formats
  const mailboxes = Array.isArray(creds.mailboxes)
    ? (creds.mailboxes as Array<{ email: string; accessToken: string; refreshToken?: string; expiresAt: number }>)
    : creds.accessToken ? [{ email: creds.email as string, accessToken: creds.accessToken as string, refreshToken: creds.refreshToken as string | undefined, expiresAt: (creds.expiresAt as number) ?? 0 }] : [];

  if (!mailboxes.length) return [];

  let updated = false;
  const results: MailboxToken[] = [];

  for (const mb of mailboxes) {
    // Refresh if expired
    if (mb.expiresAt && Date.now() > mb.expiresAt - 60000 && mb.refreshToken && clientId && clientSecret) {
      try {
        const res = await fetch(MS_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: clientId, client_secret: clientSecret,
            refresh_token: mb.refreshToken, grant_type: 'refresh_token',
            scope: 'Mail.Read Mail.Send Mail.ReadWrite offline_access',
          }),
        });
        if (res.ok) {
          const tokens = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
          mb.accessToken = tokens.access_token;
          mb.refreshToken = tokens.refresh_token ?? mb.refreshToken;
          mb.expiresAt = Date.now() + tokens.expires_in * 1000;
          updated = true;
        }
      } catch (err) { console.error(`Token refresh failed for ${mb.email}:`, err); }
    }
    if (mb.accessToken) results.push({ email: mb.email, accessToken: mb.accessToken });
  }

  if (updated) {
    const updatedCreds = { ...creds, mailboxes };
    await db.update(integrationConfigs).set({ credentials: updatedCreds, updatedAt: new Date() })
      .where(eq(integrationConfigs.id, m365Config.id));
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

async function processViaGraph(db: Database, tenantId: string): Promise<{ processed: number; tickets: number; comments: number; blocked: number }> {
  const tokens = await getGraphTokens(db, tenantId);
  console.log('[EMAIL] Graph tokens found:', tokens.length, tokens.map(t => t.email));
  if (!tokens.length) return { processed: 0, tickets: 0, comments: 0, blocked: 0 };

  let processed = 0, ticketsCreated = 0, commentsCreated = 0, blockedCount = 0;

  for (const { accessToken: token, email: mailboxEmail } of tokens) {
  try {
    // Fetch unread messages from inbox for this mailbox
    const res = await fetch(
      `${GRAPH_API}/me/mailFolders/inbox/messages?$filter=isRead eq false&$top=50&$select=id,subject,from,toRecipients,body,receivedDateTime,internetMessageId`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!res.ok) {
      const err = await res.text();
      console.error(`[EMAIL] Graph API fetch failed for ${mailboxEmail}:`, res.status, err.substring(0, 500));
      continue;
    }
    console.log(`[EMAIL] Graph API response OK for ${mailboxEmail}`);

    const data = await res.json() as { value: Array<{
      id: string; subject: string; internetMessageId: string;
      from: { emailAddress: { address: string; name: string } };
      toRecipients: Array<{ emailAddress: { address: string } }>;
      body: { content: string; contentType: string };
      receivedDateTime: string;
    }> };

    console.log(`[EMAIL] Found ${data.value.length} unread messages for ${mailboxEmail}`);
    for (const msg of data.value) {
      const fromAddress = msg.from?.emailAddress?.address?.toLowerCase();
      const fromName = msg.from?.emailAddress?.name;
      const messageId = msg.internetMessageId || msg.id;

      if (!fromAddress) continue;

      // Check if already processed
      const [existing] = await db.select().from(emailMessages)
        .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.messageId, messageId)))
        .limit(1);
      if (existing) {
        // Mark as read in Graph
        await fetch(`${GRAPH_API}/me/messages/${msg.id}`, {
          method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ isRead: true }),
        });
        continue;
      }

      const result = await processEmail(db, tenantId, {
        messageId, fromAddress, fromName: fromName ?? undefined,
        toAddress: msg.toRecipients?.[0]?.emailAddress?.address ?? '',
        subject: msg.subject ?? '(No subject)',
        bodyText: msg.body?.contentType === 'text' ? msg.body.content : stripHtml(msg.body?.content ?? ''),
        bodyHtml: msg.body?.contentType === 'html' ? msg.body.content : undefined,
      });

      if (result.blocked) { blockedCount++; }
      else {
        if (result.ticket) ticketsCreated++;
        if (result.comment) commentsCreated++;
      }

      // Mark as read
      await fetch(`${GRAPH_API}/me/messages/${msg.id}`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRead: true }),
      });
      processed++;
    }
  } catch (err) {
    console.error(`Graph API email processing failed for ${mailboxEmail}:`, err);
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
    // Support both full emails and @domain patterns
    if (bl.startsWith('@')) return senderDomain === bl.slice(1);
    return senderLower === bl;
  });

  if (isBlocked) {
    // Store email record as blocked but don't create ticket
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
      // If we didn't find a contact by email, use the ticket's existing contactId
      // (the sender may be using a different email than what's on the contact record)
      if (!contact && existingTicket.contactId) {
        const [ticketContact] = await db.select().from(contacts)
          .where(eq(contacts.id, existingTicket.contactId)).limit(1);
        if (ticketContact) contact = ticketContact;
      }

      // Strip quoted reply text so only the new content is added
      const cleanBody = stripQuotedReply(email.bodyText);
      await db.insert(ticketComments).values({
        tenantId, ticketId: existingTicket.id,
        authorType: contact ? 'contact' : 'system',
        authorId: contact?.id ?? '00000000-0000-0000-0000-000000000000',
        body: cleanBody, isInternal: false,
      });
      ticketId = existingTicket.id;
      isComment = true;
    }
  }

  if (!ticketId) {
    // Determine which customer to assign the ticket to
    const customerId = contact
      ? contact.customerId
      : await getOrCreateFallbackCustomer(db, tenantId);

    // Create new ticket from email
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

    // Apply SLA
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

    // Send ticket created email notification (fire and forget)
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
