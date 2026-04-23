import { eq, and } from 'drizzle-orm';
import { workflowRules, tickets } from '@rivertown/db';

interface WorkflowCondition {
  field: string; // priority, status, customerId, queueId, source
  operator: string; // equals, not_equals, contains, in
  value: string;
}

interface WorkflowAction {
  type: string; // assign_to, set_priority, set_status, set_queue, send_notification, add_tag
  params: Record<string, string>;
}

export async function evaluateWorkflowRules(
  db: any,
  tenantId: string,
  trigger: string,
  ticket: Record<string, unknown>,
  changes?: Record<string, unknown>,
) {
  const rules = await db.select().from(workflowRules)
    .where(and(eq(workflowRules.tenantId, tenantId), eq(workflowRules.trigger, trigger), eq(workflowRules.isActive, true)))
    .orderBy(workflowRules.sortOrder);

  for (const rule of rules) {
    const conditions = (rule.conditions as WorkflowCondition[]) || [];
    const actions = (rule.actions as WorkflowAction[]) || [];

    // Evaluate conditions
    const match = conditions.every(c => {
      const ticketValue = String(ticket[c.field] ?? '');
      switch (c.operator) {
        case 'equals': return ticketValue === c.value;
        case 'not_equals': return ticketValue !== c.value;
        case 'contains': return ticketValue.toLowerCase().includes(c.value.toLowerCase());
        case 'in': return c.value.split(',').map(v => v.trim()).includes(ticketValue);
        default: return false;
      }
    });

    if (!match) continue;

    // Execute actions
    const updates: Record<string, unknown> = {};
    for (const action of actions) {
      switch (action.type) {
        case 'assign_to': updates.assignedTo = action.params.userId; break;
        case 'set_priority': updates.priority = action.params.priority; break;
        case 'set_status': updates.status = action.params.status; break;
        case 'set_queue': updates.queueId = action.params.queueId; break;
        case 'send_notification':
          if (ticket.assignedTo) {
            const { createNotification } = await import('./notifications.js');
            await createNotification(db, {
              tenantId, userId: ticket.assignedTo as string,
              type: 'workflow_rule', title: action.params.title || rule.name,
              body: action.params.message, entityType: 'ticket', entityId: ticket.id as string,
            });
          }
          break;
        case 'add_tag':
          if (action.params.tagId && ticket.id) {
            const { ticketTagAssignments } = await import('@rivertown/db');
            try {
              await db.insert(ticketTagAssignments).values({
                ticketId: ticket.id as string,
                tagId: action.params.tagId,
              });
            } catch { /* ignore duplicate tag assignments */ }
          }
          break;
      }
    }

    if (Object.keys(updates).length > 0) {
      updates.updatedAt = new Date();
      await db.update(tickets).set(updates).where(eq(tickets.id, ticket.id as string));
    }

    // Update execution count
    await db.update(workflowRules).set({
      executionCount: (rule.executionCount ?? 0) + 1,
      lastExecutedAt: new Date(),
    }).where(eq(workflowRules.id, rule.id));
  }
}
