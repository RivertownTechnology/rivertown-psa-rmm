/**
 * Customer-support intake — ForgePSA customers (MSPs) submitting tickets to our team.
 *
 * V1 implementation: emails the ticket to support@forgepsa.com via the system Mailjet.
 * Future: route these into a dedicated "ForgePSA Support" tenant so they appear in
 * our own PSA ticketing system with full history, SLA, and assignment.
 */
import { FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { users, tenants, supportTickets } from '@rivertown/db';

const submitSchema = z.object({
  category: z.enum(['bug', 'question', 'feature', 'billing']),
  subject: z.string().trim().min(3).max(200),
  body: z.string().trim().min(10).max(10000),
});

const SUPPORT_EMAIL = 'support@forgepsa.com';

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export async function supportRoutes(fastify: FastifyInstance) {
  fastify.post(
    '/api/v1/support/tickets',
    // Public: false. Rate limited so a compromised account can't DOS our support inbox.
    {
      config: { rateLimit: { max: 5, timeWindow: '10 minutes' } } as any,
      preHandler: [fastify.authenticate],
    },
    async (request, reply) => {
      const body = submitSchema.parse(request.body);

      // Pull user + tenant context to enrich the outbound email
      const [ctx] = await fastify.db
        .select({
          userEmail: users.email,
          userName: users.displayName,
          userRole: users.role,
          tenantName: tenants.name,
          tenantSlug: tenants.slug,
          tenantPlan: tenants.planTier,
          tenantStatus: tenants.subscriptionStatus,
          tenantId: tenants.id,
        })
        .from(users)
        .innerJoin(tenants, eq(tenants.id, users.tenantId))
        .where(and(eq(users.id, request.user.sub), eq(users.tenantId, request.user.tid)))
        .limit(1);

      if (!ctx) {
        reply.code(404);
        return { error: 'USER_NOT_FOUND' };
      }

      const ticketRef = `SUP-${randomUUID().slice(0, 8).toUpperCase()}`;

      // Persist the ticket row first — it's the source of truth for the admin inbox.
      // The email is a push notification; if mail delivery fails, the row stays around.
      const [ticketRow] = await fastify.db
        .insert(supportTickets)
        .values({
          ref: ticketRef,
          tenantId: ctx.tenantId,
          userId: request.user.sub,
          userEmail: ctx.userEmail,
          category: body.category,
          subject: body.subject,
          body: body.body,
        })
        .returning({ id: supportTickets.id });

      const html = `
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:640px">
  <h2 style="color:#1e3a8a">[${body.category.toUpperCase()}] ${escapeHtml(body.subject)}</h2>
  <p style="background:#f1f5f9;padding:8px 12px;border-radius:6px;font-size:13px;color:#475569">
    <strong>Ticket ref:</strong> ${ticketRef}<br/>
    <strong>Category:</strong> ${escapeHtml(body.category)}
  </p>
  <h3 style="color:#334155;font-size:14px;margin-top:20px">Submitted by</h3>
  <table style="font-size:14px;border-collapse:collapse">
    <tr><td style="padding:2px 8px 2px 0;color:#64748b">Name</td><td>${escapeHtml(ctx.userName)}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#64748b">Email</td><td><a href="mailto:${escapeHtml(ctx.userEmail)}">${escapeHtml(ctx.userEmail)}</a></td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#64748b">Role</td><td>${escapeHtml(ctx.userRole)}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#64748b">Tenant</td><td>${escapeHtml(ctx.tenantName)} (${escapeHtml(ctx.tenantSlug)})</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#64748b">Plan</td><td>${escapeHtml(ctx.tenantPlan)} / ${escapeHtml(ctx.tenantStatus)}</td></tr>
    <tr><td style="padding:2px 8px 2px 0;color:#64748b">Tenant ID</td><td style="font-family:monospace;font-size:12px">${ctx.tenantId}</td></tr>
  </table>
  <h3 style="color:#334155;font-size:14px;margin-top:20px">Details</h3>
  <div style="background:#f8fafc;border-left:3px solid #2563eb;padding:12px 16px;white-space:pre-wrap;font-size:14px;line-height:1.6">${escapeHtml(body.body)}</div>
  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
  <p style="font-size:12px;color:#94a3b8">Reply to this email to respond to the customer.</p>
</div>`;

      const text = [
        `[${body.category.toUpperCase()}] ${body.subject}`,
        '',
        `Ticket ref: ${ticketRef}`,
        `Category: ${body.category}`,
        '',
        'Submitted by',
        `  Name: ${ctx.userName}`,
        `  Email: ${ctx.userEmail}`,
        `  Role: ${ctx.userRole}`,
        `  Tenant: ${ctx.tenantName} (${ctx.tenantSlug})`,
        `  Plan: ${ctx.tenantPlan} / ${ctx.tenantStatus}`,
        `  Tenant ID: ${ctx.tenantId}`,
        '',
        'Details',
        '---',
        body.body,
      ].join('\n');

      let emailSent = false;
      try {
        const { sendSystemEmail } = await import('../../services/system-mail.js');
        await sendSystemEmail(fastify.db, {
          to: SUPPORT_EMAIL,
          subject: `[${ticketRef}] [${body.category.toUpperCase()}] ${body.subject}`,
          html,
          text,
          replyTo: ctx.userEmail,
        });
        emailSent = true;
      } catch (err) {
        // Don't fail the whole request — ticket is persisted in DB, admin can see it in the inbox.
        request.log.warn({ err, ticketRef }, '[SUPPORT] Failed to send notification email (ticket still saved)');
      }

      // Flag the email-sent status so admins know whether to expect the push notification
      if (emailSent) {
        await fastify.db
          .update(supportTickets)
          .set({ emailSent: true })
          .where(eq(supportTickets.id, ticketRow.id));
      }

      request.log.info({
        ticketRef,
        category: body.category,
        tenantId: ctx.tenantId,
        userId: request.user.sub,
      }, '[SUPPORT] Ticket submitted');

      reply.code(201);
      return { id: ticketRef };
    },
  );
}
