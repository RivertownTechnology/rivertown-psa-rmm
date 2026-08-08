import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import {
  workflowRules,
  workflowExecutionLog,
  tickets,
  ticketComments,
  ticketTagAssignments,
  users,
} from '@rivertown/db';
import { createNotification, notifyTenantStaff } from './notifications.js';
import { broadcastToTenant } from '../ws/broadcast.js';

// ── Type Definitions ─────────────────────────────────────────────────

export type TriggerType =
  | 'ticket_created'
  | 'ticket_updated'
  | 'status_changed'
  | 'priority_changed'
  | 'assigned_changed'
  | 'customer_replied'
  | 'ticket_resolved'
  | 'ticket_closed'
  | 'no_customer_response'
  | 'no_tech_update'
  | 'ticket_in_status'
  | 'sla_warning'
  | 'sla_breach'
  | 'scheduled_check';

export type ActionType =
  | 'assign_to'
  | 'set_priority'
  | 'set_status'
  | 'set_queue'
  | 'close_ticket'
  | 'reopen_ticket'
  | 'escalate_ticket'
  | 'add_tag'
  | 'remove_tag'
  | 'add_internal_note'
  | 'add_public_reply'
  | 'send_notification'
  | 'send_email_template'
  | 'send_customer_notification'
  | 'notify_manager'
  | 'create_follow_up_ticket'
  | 'pause_sla'
  | 'resume_sla'
  | 'webhook_call';

// ── Internal Types ───────────────────────────────────────────────────

interface WorkflowCondition {
  field: string;
  operator: string;
  value: string;
}

interface ConditionGroup {
  logic: 'and' | 'or';
  conditions: WorkflowCondition[];
}

interface ConditionsLogic {
  logic: 'and' | 'or';
  groups: ConditionGroup[];
}

interface WorkflowAction {
  type: ActionType;
  params: Record<string, string>;
}

interface ActionResult {
  type: string;
  success: boolean;
  error?: string;
}

interface RuleExecutionResult {
  ruleId: string;
  ruleName: string;
  matched: boolean;
  actionsExecuted: ActionResult[];
  success: boolean;
}

const SYSTEM_AUTHOR_ID = '00000000-0000-0000-0000-000000000000';

const PRIORITY_ESCALATION: Record<string, string> = {
  low: 'medium',
  medium: 'high',
  high: 'critical',
  critical: 'critical',
};

// ── Condition Evaluation ─────────────────────────────────────────────

function minutesSince(date: Date | string | null | undefined): number {
  if (!date) return 0;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Math.floor((Date.now() - d.getTime()) / 60_000);
}

function resolveFieldValue(field: string, ticket: Record<string, unknown>): string {
  // Computed time-based fields
  switch (field) {
    case 'time_in_status_minutes':
      return String(minutesSince(ticket.updatedAt as Date | string | null));
    case 'open_for_minutes':
      return String(minutesSince(ticket.createdAt as Date | string | null));
    case 'last_customer_response_minutes':
      // Expected to be precomputed on the ticket object
      return String(ticket.last_customer_response_minutes ?? ticket.lastCustomerResponseMinutes ?? 0);
    case 'last_tech_response_minutes':
      return String(ticket.last_tech_response_minutes ?? ticket.lastTechResponseMinutes ?? 0);
    default:
      return String(ticket[field] ?? '');
  }
}

function evaluateSingleCondition(
  condition: WorkflowCondition,
  ticket: Record<string, unknown>,
): boolean {
  const ticketValue = resolveFieldValue(condition.field, ticket);
  const condValue = condition.value ?? '';

  switch (condition.operator) {
    case 'equals':
      return ticketValue === condValue;

    case 'not_equals':
      return ticketValue !== condValue;

    case 'contains':
      return ticketValue.toLowerCase().includes(condValue.toLowerCase());

    case 'not_contains':
      return !ticketValue.toLowerCase().includes(condValue.toLowerCase());

    case 'in':
      return condValue
        .split(',')
        .map((v) => v.trim())
        .includes(ticketValue);

    case 'not_in':
      return !condValue
        .split(',')
        .map((v) => v.trim())
        .includes(ticketValue);

    case 'is_empty':
      return ticketValue === '' || ticketValue === 'null' || ticketValue === 'undefined';

    case 'is_not_empty':
      return ticketValue !== '' && ticketValue !== 'null' && ticketValue !== 'undefined';

    case 'greater_than':
      return parseFloat(ticketValue) > parseFloat(condValue);

    case 'less_than':
      return parseFloat(ticketValue) < parseFloat(condValue);

    default:
      return false;
  }
}

/**
 * Evaluate a nested condition group structure with AND/OR logic.
 * Falls back to flat conditions array with AND if conditionsLogic is absent.
 */
export function evaluateConditionGroup(
  conditionsLogic: ConditionsLogic | null | undefined,
  conditions: WorkflowCondition[] | null | undefined,
  ticket: Record<string, unknown>,
): boolean {
  // If nested conditionsLogic is provided, use it
  if (conditionsLogic && conditionsLogic.groups && conditionsLogic.groups.length > 0) {
    const outerLogic = conditionsLogic.logic || 'and';
    const groupResults = conditionsLogic.groups.map((group) => {
      const innerLogic = group.logic || 'and';
      const conditionResults = (group.conditions || []).map((c) =>
        evaluateSingleCondition(c, ticket),
      );

      if (conditionResults.length === 0) return true;
      return innerLogic === 'and'
        ? conditionResults.every(Boolean)
        : conditionResults.some(Boolean);
    });

    if (groupResults.length === 0) return true;
    return outerLogic === 'and' ? groupResults.every(Boolean) : groupResults.some(Boolean);
  }

  // Fall back to flat conditions array with AND logic
  const flatConditions = conditions || [];
  if (flatConditions.length === 0) return true;
  return flatConditions.every((c) => evaluateSingleCondition(c, ticket));
}

/**
 * Evaluate exit conditions. Returns true if ANY condition matches (OR semantics),
 * meaning the rule should STOP executing.
 */
export function evaluateExitConditions(
  exitConditions: WorkflowCondition[] | null | undefined,
  ticket: Record<string, unknown>,
): boolean {
  if (!exitConditions || exitConditions.length === 0) return false;
  return exitConditions.some((c) => evaluateSingleCondition(c, ticket));
}

// ── Action Execution ─────────────────────────────────────────────────

export async function executeAction(
  db: any,
  tenantId: string,
  action: WorkflowAction,
  ticket: Record<string, unknown>,
  rule: Record<string, unknown>,
): Promise<ActionResult> {
  const params = action.params || {};
  const ticketId = ticket.id as string;

  try {
    switch (action.type) {
      // ── Ticket Field Updates ──────────────────────────────────────

      case 'assign_to': {
        await db
          .update(tickets)
          .set({ assignedTo: params.userId, updatedAt: new Date() })
          .where(eq(tickets.id, ticketId));
        return { type: action.type, success: true };
      }

      case 'set_priority': {
        await db
          .update(tickets)
          .set({ priority: params.priority, updatedAt: new Date() })
          .where(eq(tickets.id, ticketId));
        return { type: action.type, success: true };
      }

      case 'set_status': {
        const updates: Record<string, unknown> = {
          status: params.status,
          updatedAt: new Date(),
        };
        if (params.status === 'resolved') updates.resolvedAt = new Date();
        if (params.status === 'closed') updates.closedAt = new Date();
        await db.update(tickets).set(updates).where(eq(tickets.id, ticketId));
        return { type: action.type, success: true };
      }

      case 'set_queue': {
        await db
          .update(tickets)
          .set({ queueId: params.queueId, updatedAt: new Date() })
          .where(eq(tickets.id, ticketId));
        return { type: action.type, success: true };
      }

      case 'close_ticket': {
        await db
          .update(tickets)
          .set({ status: 'closed', closedAt: new Date(), updatedAt: new Date() })
          .where(eq(tickets.id, ticketId));
        return { type: action.type, success: true };
      }

      case 'reopen_ticket': {
        await db
          .update(tickets)
          .set({
            status: 'open',
            resolvedAt: null,
            closedAt: null,
            updatedAt: new Date(),
          })
          .where(eq(tickets.id, ticketId));
        return { type: action.type, success: true };
      }

      case 'escalate_ticket': {
        const currentPriority = String(ticket.priority || 'medium');
        const newPriority = PRIORITY_ESCALATION[currentPriority] || 'critical';
        await db
          .update(tickets)
          .set({ priority: newPriority, updatedAt: new Date() })
          .where(eq(tickets.id, ticketId));

        // Add internal note about escalation
        await db.insert(ticketComments).values({
          tenantId,
          ticketId,
          authorType: 'system',
          authorId: SYSTEM_AUTHOR_ID,
          body: `Escalated by workflow: ${rule.name}`,
          isInternal: true,
        });

        return { type: action.type, success: true };
      }

      // ── Tag Management ────────────────────────────────────────────

      case 'add_tag': {
        if (!params.tagId) return { type: action.type, success: false, error: 'Missing tagId' };

        // Check for duplicate before inserting
        const existing = await db
          .select({ id: ticketTagAssignments.id })
          .from(ticketTagAssignments)
          .where(
            and(
              eq(ticketTagAssignments.ticketId, ticketId),
              eq(ticketTagAssignments.tagId, params.tagId),
            ),
          )
          .limit(1);

        if (existing.length === 0) {
          await db.insert(ticketTagAssignments).values({
            ticketId,
            tagId: params.tagId,
          });
        }

        return { type: action.type, success: true };
      }

      case 'remove_tag': {
        if (!params.tagId) return { type: action.type, success: false, error: 'Missing tagId' };

        await db
          .delete(ticketTagAssignments)
          .where(
            and(
              eq(ticketTagAssignments.ticketId, ticketId),
              eq(ticketTagAssignments.tagId, params.tagId),
            ),
          );

        return { type: action.type, success: true };
      }

      // ── Comments ──────────────────────────────────────────────────

      case 'add_internal_note': {
        await db.insert(ticketComments).values({
          tenantId,
          ticketId,
          authorType: 'system',
          authorId: SYSTEM_AUTHOR_ID,
          body: params.message || '',
          isInternal: true,
        });
        return { type: action.type, success: true };
      }

      case 'add_public_reply': {
        await db.insert(ticketComments).values({
          tenantId,
          ticketId,
          authorType: 'system',
          authorId: SYSTEM_AUTHOR_ID,
          body: params.message || '',
          isInternal: false,
        });
        return { type: action.type, success: true };
      }

      // ── Notifications ─────────────────────────────────────────────

      case 'send_notification': {
        const targetUserId = params.userId || (ticket.assignedTo as string);
        if (!targetUserId) {
          return { type: action.type, success: false, error: 'No target user for notification' };
        }

        await createNotification(db, {
          tenantId,
          userId: targetUserId,
          type: 'workflow',
          title: params.title || (rule.name as string) || 'Workflow Notification',
          body: params.message || '',
          entityType: 'ticket',
          entityId: ticketId,
        });

        return { type: action.type, success: true };
      }

      case 'send_email_template': {
        // Email sending will be wired later
        console.log('[workflow] Would send email template:', params.templateId);
        return { type: action.type, success: true };
      }

      case 'send_customer_notification': {
        // Customer notification will be wired later
        console.log('[workflow] Would send customer notification for ticket:', ticketId);
        return { type: action.type, success: true };
      }

      case 'notify_manager': {
        // Send notification to tenant admin/owner
        const managers = await db
          .select({ id: users.id })
          .from(users)
          .where(
            and(
              eq(users.tenantId, tenantId),
              eq(users.isActive, true),
              sql`${users.role} IN ('owner', 'admin')`,
            ),
          );

        for (const manager of managers) {
          await createNotification(db, {
            tenantId,
            userId: manager.id,
            type: 'workflow',
            title: params.title || `Workflow alert: ${rule.name}`,
            body: params.message || `Rule "${rule.name}" triggered on ticket #${ticket.ticketNumber}`,
            entityType: 'ticket',
            entityId: ticketId,
          });
        }

        return { type: action.type, success: true };
      }

      // ── Ticket Creation ───────────────────────────────────────────

      case 'create_follow_up_ticket': {
        const [{ nextNumber }] = await db.execute(
          sql`SELECT COALESCE(MAX(ticket_number), 0) + 1 AS "nextNumber" FROM tickets WHERE tenant_id = ${tenantId}`,
        );

        const [followUpTicket] = await db.insert(tickets).values({
          tenantId,
          ticketNumber: nextNumber,
          subject: `Follow-up: ${ticket.subject}`,
          description: params.description || `Follow-up ticket created by workflow: ${rule.name}`,
          customerId: ticket.customerId as string,
          priority: params.priority || (ticket.priority as string) || 'medium',
          status: 'new',
          source: 'workflow',
        }).returning();

        await notifyTenantStaff(db, {
          tenantId,
          type: 'ticket_created',
          title: `New ticket #${nextNumber}`,
          body: followUpTicket.subject,
          entityType: 'ticket',
          entityId: followUpTicket.id,
        }).catch(() => {});
        broadcastToTenant(tenantId, { type: 'ticket.created', ticketId: followUpTicket.id });

        return { type: action.type, success: true };
      }

      // ── SLA Control ───────────────────────────────────────────────

      case 'pause_sla': {
        await db
          .update(tickets)
          .set({ slaPausedAt: new Date(), updatedAt: new Date() })
          .where(eq(tickets.id, ticketId));
        return { type: action.type, success: true };
      }

      case 'resume_sla': {
        const slaPausedAt = ticket.slaPausedAt as Date | string | null;
        if (slaPausedAt) {
          const pausedTime =
            typeof slaPausedAt === 'string' ? new Date(slaPausedAt) : slaPausedAt;
          const pauseDurationMs = Date.now() - pausedTime.getTime();
          const currentPausedMs = (ticket.slaTotalPausedMs as number) || 0;

          await db
            .update(tickets)
            .set({
              slaPausedAt: null,
              slaTotalPausedMs: currentPausedMs + pauseDurationMs,
              updatedAt: new Date(),
            })
            .where(eq(tickets.id, ticketId));
        }
        return { type: action.type, success: true };
      }

      // ── External Integration ──────────────────────────────────────

      case 'webhook_call': {
        if (!params.url) {
          return { type: action.type, success: false, error: 'Missing webhook URL' };
        }

        // SSRF guard — reject internal/metadata targets before fetching
        const { assertPublicHttpUrl } = await import('../common/ssrf.js');
        try {
          await assertPublicHttpUrl(params.url as string);
        } catch (e) {
          return { type: action.type, success: false, error: `Webhook URL rejected: ${(e as Error).message}` };
        }

        await fetch(params.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            event: rule.trigger,
            ticket: {
              id: ticket.id,
              ticketNumber: ticket.ticketNumber,
              subject: ticket.subject,
              status: ticket.status,
              priority: ticket.priority,
            },
            rule: {
              id: rule.id,
              name: rule.name,
            },
          }),
          signal: AbortSignal.timeout(10_000),
        }).catch((err: Error) => console.error('[workflow] Webhook failed:', err.message));

        return { type: action.type, success: true };
      }

      default:
        return { type: action.type, success: false, error: `Unknown action type: ${action.type}` };
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[workflow] Action ${action.type} failed:`, message);
    return { type: action.type, success: false, error: message };
  }
}

// ── Execution Logging ────────────────────────────────────────────────

export async function logExecution(
  db: any,
  tenantId: string,
  ruleId: string,
  ticketId: string,
  trigger: string,
  conditionsMatched: boolean,
  actionsExecuted: ActionResult[],
  success: boolean,
  error?: string,
): Promise<void> {
  try {
    await db.insert(workflowExecutionLog).values({
      tenantId,
      ruleId,
      ticketId,
      trigger,
      conditionsMatched,
      actionsExecuted: JSON.stringify(actionsExecuted),
      success,
      error: error || null,
    });
  } catch (err: unknown) {
    // Don't let logging failures break workflow execution
    console.error('[workflow] Failed to log execution:', err instanceof Error ? err.message : err);
  }
}

// ── Main Workflow Engine ─────────────────────────────────────────────

/**
 * Evaluate all active instant workflow rules matching the given trigger.
 * Backward-compatible signature: (db, tenantId, trigger, ticket, changes?)
 */
export async function evaluateWorkflowRules(
  db: any,
  tenantId: string,
  trigger: string,
  ticket: Record<string, unknown>,
  changes?: Record<string, unknown>,
): Promise<RuleExecutionResult[]> {
  const results: RuleExecutionResult[] = [];

  // Fetch active instant rules (not templates) matching the trigger
  const rules = await db
    .select()
    .from(workflowRules)
    .where(
      and(
        eq(workflowRules.tenantId, tenantId),
        eq(workflowRules.trigger, trigger),
        eq(workflowRules.isActive, true),
        eq(workflowRules.ruleType, 'instant'),
        eq(workflowRules.isTemplate, false),
      ),
    )
    .orderBy(workflowRules.sortOrder);

  for (const rule of rules) {
    const conditionsLogic = rule.conditionsLogic as ConditionsLogic | null;
    const flatConditions = (rule.conditions as WorkflowCondition[]) || [];
    const actions = (rule.actions as WorkflowAction[]) || [];
    const exitConds = (rule.exitConditions as WorkflowCondition[]) || [];

    // Build enriched ticket context with changes
    const ticketContext: Record<string, unknown> = { ...ticket };
    if (changes) {
      ticketContext._changes = changes;
    }

    // Evaluate exit conditions first (OR semantics) -- if any match, skip this rule
    if (evaluateExitConditions(exitConds, ticketContext)) {
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matched: false,
        actionsExecuted: [],
        success: true,
      });
      continue;
    }

    // Evaluate conditions (nested groups or flat)
    const matched = evaluateConditionGroup(conditionsLogic, flatConditions, ticketContext);

    if (!matched) {
      // Log non-match if logging is enabled
      if (rule.logEnabled) {
        await logExecution(db, tenantId, rule.id, ticket.id as string, trigger, false, [], true);
      }
      results.push({
        ruleId: rule.id,
        ruleName: rule.name,
        matched: false,
        actionsExecuted: [],
        success: true,
      });
      continue;
    }

    // Execute actions, collecting results
    const actionResults: ActionResult[] = [];
    let allSucceeded = true;

    for (const action of actions) {
      try {
        const result = await executeAction(db, tenantId, action, ticketContext, rule);
        actionResults.push(result);
        if (!result.success) allSucceeded = false;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        actionResults.push({ type: action.type, success: false, error: message });
        allSucceeded = false;
      }
    }

    // A matched rule's actions can touch all sorts of ticket fields (status,
    // priority, assignment, tags, ...) — rather than instrumenting every
    // individual action case, broadcast one generic update for the ticket
    // that was evaluated. Actions that create a *different* ticket (e.g.
    // create_follow_up_ticket) broadcast their own ticket.created separately.
    if (actions.length > 0) {
      broadcastToTenant(tenantId, { type: 'ticket.updated', ticketId: ticket.id as string });
    }

    // Log execution if enabled
    if (rule.logEnabled) {
      const errorMsg = allSucceeded
        ? undefined
        : actionResults
            .filter((r) => !r.success)
            .map((r) => `${r.type}: ${r.error}`)
            .join('; ');

      await logExecution(
        db,
        tenantId,
        rule.id,
        ticket.id as string,
        trigger,
        true,
        actionResults,
        allSucceeded,
        errorMsg,
      );
    }

    // Update execution count and lastExecutedAt
    await db
      .update(workflowRules)
      .set({
        executionCount: (rule.executionCount ?? 0) + 1,
        lastExecutedAt: new Date(),
      })
      .where(eq(workflowRules.id, rule.id));

    results.push({
      ruleId: rule.id,
      ruleName: rule.name,
      matched: true,
      actionsExecuted: actionResults,
      success: allSucceeded,
    });
  }

  return results;
}
