import { createHash } from 'node:crypto';
import { z } from 'zod';

const externalId = z.string().trim().min(1).max(256);
export const contextSchema = z.object({
  contactId: z.string().uuid(),
  appleCustomerId: externalId,
}).strict();
export const intakeSchema = contextSchema.extend({
  requestId: externalId,
  subject: z.string().trim().min(1).max(500),
  description: z.string().trim().min(1).max(12000),
  name: z.string().trim().max(200).optional(),
  company: z.string().trim().max(200).optional(),
  email: z.string().email().max(254).optional(),
  device: z.string().trim().max(200).optional(),
  impact: z.string().trim().max(2000).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
}).strict();
export const eventSchema = contextSchema.extend({
  requestId: externalId,
  intakeRequestId: externalId.optional(),
  occurredAt: z.string().datetime({ offset: true }).refine(v => Date.parse(v) <= Date.now() + 300000, 'Timestamp is in the future'),
  type: z.enum(['message', 'handoff']),
  sender: z.enum(['customer', 'agent', 'bot', 'system']).optional(),
  text: z.string().min(1).max(16000).optional(),
  state: z.enum(['bot', 'queued', 'human', 'ended']).optional(),
}).strict().superRefine((v, ctx) => {
  if (v.type === 'message' && (!v.sender || !v.text || v.state)) ctx.addIssue({ code: 'custom', message: 'Messages require sender/text and cannot set state' });
  if (v.type === 'handoff' && (!v.state || v.text || v.sender || v.intakeRequestId)) ctx.addIssue({ code: 'custom', message: 'Handoffs require state only' });
});
export const credentialSchema = z.object({
  name: z.string().trim().min(1).max(100),
  appleBusinessId: z.string().uuid(),
  instanceArn: z.string().regex(/^arn:aws:connect:[a-z0-9-]+:\d{12}:instance\/[0-9a-f-]{36}$/),
}).strict();
export const verificationSchema = z.object({
  contactId: z.string().uuid().nullable(),
  note: z.string().trim().min(10).max(2000),
}).strict();

export function hashToken(token: string) { return createHash('sha256').update(token).digest('hex'); }
export function payloadHash(value: unknown): string {
  function sorted(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(sorted);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, item]) => [k, sorted(item)]));
    return v;
  }
  return hashToken(JSON.stringify(sorted(value)));
}
