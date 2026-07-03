/**
 * Timed workflow rule scheduler.
 * Runs every 60 seconds and evaluates timed/scheduled rules against matching tickets.
 */
import { eq, and, sql, ne, inArray } from 'drizzle-orm';
import { workflowRules, workflowTicketExecutions, tickets, ticketComments } from '@rivertown/db';

export function startWorkflowScheduler(db: any) {
  let running = false;

  setInterval(async () => {
    if (running) return;
    running = true;

    try {
      // Fetch all active timed rules (not templates)
      const timedRules = await db.select().from(workflowRules)
        .where(and(
          eq(workflowRules.isActive, true),
          eq(workflowRules.isTemplate, false),
          sql`${workflowRules.ruleType} IN ('timed', 'scheduled')`,
        ));

      if (timedRules.length === 0) { running = false; return; }

      // Lazy-import the engine to avoid circular deps
      const { evaluateConditionGroup, evaluateExitConditions, executeAction, logExecution } = await import('./workflow-engine.js');

      for (const rule of timedRules) {
        try {
          const timeConfig = (rule.timeConfig || {}) as Record<string, unknown>;
          // Coerce to a finite number — this value is interpolated into a SQL
          // interval below, so it must never be attacker-controlled text.
          const delayMinutes = Number.isFinite(Number(timeConfig.delayMinutes)) ? Number(timeConfig.delayMinutes) : 0;
          const maxExec = (timeConfig.maxExecutionsPerTicket as number) || 1;
          const trigger = rule.trigger as string;

          // Find candidate tickets based on trigger type
          let candidateTickets: any[] = [];

          if (trigger === 'no_customer_response' || trigger === 'no_tech_update') {
            // Tickets that are open/pending/waiting and haven't had recent activity
            candidateTickets = await db.select().from(tickets)
              .where(and(
                eq(tickets.tenantId, rule.tenantId),
                sql`${tickets.status} NOT IN ('resolved', 'closed')`,
                sql`${tickets.updatedAt} < NOW() - (${delayMinutes} * INTERVAL '1 minute')`,
              )).limit(200);
          } else if (trigger === 'ticket_in_status') {
            // Tickets that have been in their current status for longer than delay
            candidateTickets = await db.select().from(tickets)
              .where(and(
                eq(tickets.tenantId, rule.tenantId),
                sql`${tickets.status} NOT IN ('closed')`,
                sql`${tickets.updatedAt} < NOW() - (${delayMinutes} * INTERVAL '1 minute')`,
              )).limit(200);
          } else if (trigger === 'sla_warning') {
            // Tickets where SLA due date is approaching
            candidateTickets = await db.select().from(tickets)
              .where(and(
                eq(tickets.tenantId, rule.tenantId),
                sql`${tickets.status} NOT IN ('resolved', 'closed')`,
                sql`${tickets.slaResponseDueAt} IS NOT NULL`,
                sql`${tickets.slaResponseDueAt} < NOW() + (${delayMinutes} * INTERVAL '1 minute')`,
                sql`${tickets.slaResponseDueAt} > NOW()`,
              )).limit(200);
          } else if (trigger === 'sla_breach') {
            // Tickets where SLA has breached
            candidateTickets = await db.select().from(tickets)
              .where(and(
                eq(tickets.tenantId, rule.tenantId),
                sql`${tickets.status} NOT IN ('resolved', 'closed')`,
                sql`${tickets.slaResponseDueAt} IS NOT NULL`,
                sql`${tickets.slaResponseDueAt} < NOW()`,
              )).limit(200);
          } else if (trigger === 'scheduled_check') {
            // Run against all open tickets
            candidateTickets = await db.select().from(tickets)
              .where(and(
                eq(tickets.tenantId, rule.tenantId),
                sql`${tickets.status} NOT IN ('resolved', 'closed')`,
              )).limit(500);
          }

          // Pre-fetch existing execution trackers for all candidate tickets in one query
          const candidateIds = candidateTickets.map(t => t.id);
          const execRows = candidateIds.length > 0
            ? await db.select().from(workflowTicketExecutions)
                .where(and(
                  eq(workflowTicketExecutions.ruleId, rule.id),
                  inArray(workflowTicketExecutions.ticketId, candidateIds),
                ))
            : [];
          const execByTicket = new Map<string, any>(execRows.map((e: any) => [e.ticketId, e]));

          // Process each candidate ticket
          for (const ticket of candidateTickets) {
            try {
              // Check per-ticket execution tracker (from pre-fetched map)
              const existing = execByTicket.get(ticket.id);

              if (existing) {
                if (existing.suppressed) continue;
                if (existing.executionCount >= maxExec) continue;

                // Check repeat interval
                const repeatInterval = (timeConfig.repeatIntervalMinutes as number) || 0;
                if (repeatInterval > 0 && existing.lastExecutedAt) {
                  const sinceLastExec = (Date.now() - new Date(existing.lastExecutedAt).getTime()) / 60000;
                  if (sinceLastExec < repeatInterval) continue;
                }
              }

              // Check business hours if required
              if (timeConfig.businessHoursOnly) {
                const now = new Date();
                const hour = now.getHours();
                const day = now.getDay();
                if (day === 0 || day === 6) continue; // weekend
                if (hour < 8 || hour >= 17) continue; // outside 8am-5pm
              }

              if (timeConfig.excludeWeekends) {
                const day = new Date().getDay();
                if (day === 0 || day === 6) continue;
              }

              // Evaluate conditions
              const conditionsLogic = rule.conditionsLogic as any;
              const conditions = rule.conditions as any[];
              const matched = evaluateConditionGroup(conditionsLogic, conditions, ticket);

              if (!matched) continue;

              // Check exit conditions
              const exitConds = (rule.exitConditions || []) as any[];
              if (exitConds.length > 0 && evaluateExitConditions(exitConds, ticket)) {
                // Suppress future executions for this ticket
                if (existing) {
                  await db.update(workflowTicketExecutions).set({ suppressed: true })
                    .where(eq(workflowTicketExecutions.id, existing.id));
                } else {
                  await db.insert(workflowTicketExecutions).values({
                    tenantId: rule.tenantId, ruleId: rule.id, ticketId: ticket.id,
                    executionCount: 0, suppressed: true,
                  }).onConflictDoNothing();
                }
                continue;
              }

              // Execute actions
              const actionsExecuted: any[] = [];
              let success = true;
              for (const action of (rule.actions as any[])) {
                try {
                  const result = await executeAction(db, rule.tenantId, action, ticket, rule);
                  actionsExecuted.push(result);
                } catch (err) {
                  actionsExecuted.push({ type: action.type, success: false, error: String(err) });
                  success = false;
                }
              }

              // Update per-ticket tracker
              if (existing) {
                await db.update(workflowTicketExecutions).set({
                  executionCount: existing.executionCount + 1,
                  lastExecutedAt: new Date(),
                }).where(eq(workflowTicketExecutions.id, existing.id));
              } else {
                await db.insert(workflowTicketExecutions).values({
                  tenantId: rule.tenantId, ruleId: rule.id, ticketId: ticket.id,
                  executionCount: 1, lastExecutedAt: new Date(),
                }).onConflictDoNothing();
              }

              // Update rule execution count
              await db.update(workflowRules).set({
                executionCount: sql`${workflowRules.executionCount} + 1`,
                lastExecutedAt: new Date(),
              }).where(eq(workflowRules.id, rule.id));

              // Log execution
              if (rule.logEnabled) {
                await logExecution(db, rule.tenantId, rule.id, ticket.id, trigger, true, actionsExecuted, success);
              }

            } catch (ticketErr) {
              console.error(`[workflow-scheduler] Error processing ticket ${ticket.id} for rule ${rule.id}:`, ticketErr);
            }
          }
        } catch (ruleErr) {
          console.error(`[workflow-scheduler] Error processing rule ${rule.id}:`, ruleErr);
        }
      }
    } catch (err) {
      console.error('[workflow-scheduler] Scheduler error:', err);
    } finally {
      running = false;
    }
  }, 60_000);
}
