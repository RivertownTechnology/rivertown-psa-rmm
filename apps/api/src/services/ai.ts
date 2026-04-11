import Anthropic from '@anthropic-ai/sdk';
import { eq, and } from 'drizzle-orm';
import { tickets, ticketComments, integrationConfigs } from '@rivertown/db';
import type { Database } from '@rivertown/db';
import { readCredentials } from '../common/credentials.js';

async function getAIConfig(db: Database, tenantId: string): Promise<{ apiKey: string; model: string } | null> {
  const [config] = await db.select().from(integrationConfigs)
    .where(and(eq(integrationConfigs.tenantId, tenantId), eq(integrationConfigs.provider, 'ai')))
    .limit(1);

  if (config?.isEnabled) {
    const creds = readCredentials(config.credentials);
    const settings = (config.settings ?? {}) as Record<string, string>;
    const apiKey = (creds.apiKey as string) || process.env.ANTHROPIC_API_KEY || '';
    if (apiKey) return { apiKey, model: settings.model || 'claude-sonnet-4-20250514' };
  }

  // Fall back to env var
  const envKey = process.env.ANTHROPIC_API_KEY;
  if (envKey) return { apiKey: envKey, model: 'claude-sonnet-4-20250514' };

  return null;
}

export async function summarizeTicket(db: Database, tenantId: string, ticketId: string): Promise<string> {
  const ai = await getAIConfig(db, tenantId);
  if (!ai) throw new Error('AI is not configured. Add your Anthropic API key in Settings > AI Assistant.');

  const [ticket] = await db.select().from(tickets)
    .where(and(eq(tickets.id, ticketId), eq(tickets.tenantId, tenantId))).limit(1);
  if (!ticket) throw new Error('Ticket not found');

  const comments = await db.select().from(ticketComments)
    .where(and(eq(ticketComments.ticketId, ticketId), eq(ticketComments.tenantId, tenantId)))
    .orderBy(ticketComments.createdAt);

  const conversationText = comments.map(c => {
    const author = c.authorType === 'user' ? 'Technician' : c.authorType === 'contact' ? 'Customer' : 'System';
    const internal = c.isInternal ? ' [INTERNAL NOTE]' : '';
    return `${author}${internal}: ${c.body}`;
  }).join('\n\n');

  const prompt = `Summarize this IT support ticket concisely. Include: the issue reported, steps taken so far, current status, and any next steps needed.

Subject: ${ticket.subject}
Status: ${ticket.status}
Priority: ${ticket.priority}
${ticket.description ? `Description: ${ticket.description}` : ''}

${conversationText ? `Conversation:\n${conversationText}` : 'No conversation yet.'}`;

  const client = new Anthropic({ apiKey: ai.apiKey });
  const response = await client.messages.create({
    model: ai.model,
    max_tokens: 500,
    messages: [{ role: 'user', content: prompt }],
    system: 'You are an IT support assistant. Provide concise, actionable ticket summaries. Use bullet points. Keep it under 200 words.',
  });

  const text = response.content[0];
  if (text.type !== 'text') throw new Error('Unexpected AI response');
  return text.text;
}

export async function improveReply(
  db: Database, tenantId: string, draftText: string, ticketSubject: string,
): Promise<string> {
  const ai = await getAIConfig(db, tenantId);
  if (!ai) throw new Error('AI is not configured. Add your Anthropic API key in Settings > AI Assistant.');

  const prompt = `Rewrite this IT support reply to be professional, clear, and customer-friendly. Explain any technical concepts in simple terms. Keep the same meaning and all important information. Do not add greetings or sign-offs — just the body text.

Ticket subject: ${ticketSubject}

Draft reply:
${draftText}`;

  const client = new Anthropic({ apiKey: ai.apiKey });
  const response = await client.messages.create({
    model: ai.model,
    max_tokens: 1000,
    messages: [{ role: 'user', content: prompt }],
    system: 'You are an IT support communication assistant. Rewrite technical support replies to be clear, professional, and easy for non-technical customers to understand. Return only the improved reply text, nothing else.',
  });

  const text = response.content[0];
  if (text.type !== 'text') throw new Error('Unexpected AI response');
  return text.text;
}
