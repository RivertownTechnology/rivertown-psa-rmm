import { Database, auditLog } from '@rivertown/db';

export interface AuditEntry {
  tenantId: string;
  actorType: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  ipAddress?: string;
}

export async function logAudit(db: Database, entry: AuditEntry) {
  await db.insert(auditLog).values({
    tenantId: entry.tenantId,
    actorType: entry.actorType,
    actorId: entry.actorId,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId,
    changes: entry.changes ?? null,
    ipAddress: entry.ipAddress ?? null,
  });
}

export function diffChanges<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Record<string, { old: unknown; new: unknown }> | undefined {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const key of Object.keys(after)) {
    if (after[key] !== before[key]) {
      changes[key] = { old: before[key], new: after[key] };
    }
  }
  return Object.keys(changes).length > 0 ? changes : undefined;
}
