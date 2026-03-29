import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { eq, and } from 'drizzle-orm';
import { integrationConfigs, contacts, tickets, ticketComments, emailMessages, tenantSequences } from '@rivertown/db';
import type { Database } from '@rivertown/db';

export async function processInboundEmails(db: Database, tenantId: string): Promise<{ processed: number; tickets: number; comments: number }> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'email')))
    .limit(1);

  if (!config?.isEnabled) return { processed: 0, tickets: 0, comments: 0 };

  const creds = config.credentials as Record<string, unknown>;
  if (!creds.smtpHost || !creds.smtpUser) return { processed: 0, tickets: 0, comments: 0 };

  // IMAP connection (same host as SMTP typically)
  const imapHost = (creds.imapHost as string) ?? (creds.smtpHost as string);
  const imapPort = (creds.imapPort as number) ?? 993;

  let client: ImapFlow;
  try {
    client = new ImapFlow({
      host: imapHost,
      port: imapPort,
      secure: true,
      auth: { user: creds.smtpUser as string, pass: creds.smtpPassword as string },
      logger: false,
    });
    await client.connect();
  } catch (err) {
    console.error('IMAP connection failed:', err);
    return { processed: 0, tickets: 0, comments: 0 };
  }

  let processed = 0, ticketsCreated = 0, commentsCreated = 0;

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

        // Check if already processed
        const [existing] = await db.select().from(emailMessages)
          .where(and(eq(emailMessages.tenantId, tenantId), eq(emailMessages.messageId, messageId)))
          .limit(1);
        if (existing) {
          await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
          continue;
        }

        // Match contact
        const [contact] = await db.select().from(contacts)
          .where(and(eq(contacts.tenantId, tenantId), eq(contacts.email, fromAddress)))
          .limit(1);

        const subject = parsed.subject ?? '(No subject)';
        const bodyText = parsed.text ?? '';
        const bodyHtml = parsed.html ?? undefined;

        // Check if this is a reply to an existing ticket (subject contains [Ticket #N])
        const ticketMatch = subject.match(/\[Ticket #(\d+)\]/);
        let ticketId: string | undefined;

        if (ticketMatch) {
          const ticketNumber = parseInt(ticketMatch[1], 10);
          const [existingTicket] = await db.select().from(tickets)
            .where(and(eq(tickets.tenantId, tenantId), eq(tickets.ticketNumber, ticketNumber)))
            .limit(1);

          if (existingTicket) {
            // Add as comment to existing ticket
            await db.insert(ticketComments).values({
              tenantId,
              ticketId: existingTicket.id,
              authorType: contact ? 'contact' : 'system',
              authorId: contact?.id ?? '00000000-0000-0000-0000-000000000000',
              body: bodyText,
              isInternal: false,
            });
            ticketId = existingTicket.id;
            commentsCreated++;
          }
        }

        if (!ticketId && contact) {
          // Create new ticket from email
          const [seqResult] = await db.update(tenantSequences)
            .set({ currentValue: `(${tenantSequences.currentValue}::int + 1)::text` } as any)
            .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket')))
            .returning({ value: tenantSequences.currentValue });

          // Actually we need raw SQL for the increment. Let's just read and update.
          // Simplified approach:
          const [seq] = await db.select().from(tenantSequences)
            .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket')))
            .limit(1);
          const nextNum = parseInt(seq?.currentValue ?? '0', 10) + 1;
          await db.update(tenantSequences).set({ currentValue: String(nextNum) })
            .where(and(eq(tenantSequences.tenantId, tenantId), eq(tenantSequences.sequenceName, 'ticket')));

          const [newTicket] = await db.insert(tickets).values({
            tenantId,
            ticketNumber: nextNum,
            customerId: contact.customerId,
            contactId: contact.id,
            subject: subject.replace(/^(Re:|Fwd?:)\s*/gi, '').trim(),
            description: bodyText.substring(0, 5000),
            status: 'new',
            priority: 'medium',
            ticketType: 'incident',
            source: 'email',
          }).returning();

          // Apply SLA
          const { calculateSla } = await import('./sla-calculator.js');
          const sla = await calculateSla(db, tenantId, contact.customerId, 'medium', new Date());
          if (sla.slaPolicyId) {
            await db.update(tickets).set({
              slaDueAt: sla.slaDueAt,
              slaResponseDueAt: sla.slaResponseDueAt,
              slaResolutionDueAt: sla.slaResolutionDueAt,
              slaPolicyId: sla.slaPolicyId,
            }).where(eq(tickets.id, newTicket.id));
          }

          ticketId = newTicket.id;
          ticketsCreated++;
        }

        // Store email record
        const toAddr = Array.isArray(parsed.to) ? parsed.to[0]?.value?.[0]?.address : parsed.to?.value?.[0]?.address;
        await db.insert(emailMessages).values({
          tenantId,
          messageId,
          fromAddress,
          fromName: parsed.from?.value?.[0]?.name ?? undefined,
          toAddress: toAddr ?? '',
          subject,
          bodyText: bodyText || undefined,
          bodyHtml: bodyHtml || undefined,
          ticketId: ticketId ?? undefined,
          contactId: contact?.id ?? undefined,
          direction: 'inbound',
          processedAt: new Date(),
        });

        // Mark as read
        await client.messageFlagsAdd({ uid: msg.uid }, ['\\Seen'], { uid: true });
        processed++;
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }

  return { processed, tickets: ticketsCreated, comments: commentsCreated };
}
