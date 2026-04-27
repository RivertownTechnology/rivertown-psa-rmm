/**
 * Strip dangerous fields from request body before spreading into DB updates.
 * Prevents attackers from overwriting tenantId, id, or other protected fields.
 */

const PROTECTED_FIELDS = new Set([
  'id', 'tenantId', 'tenant_id', 'createdAt', 'created_at',
]);

export function sanitizeBody<T extends Record<string, unknown>>(body: T): Omit<T, 'id' | 'tenantId' | 'tenant_id' | 'createdAt' | 'created_at'> {
  const clean = { ...body };
  for (const key of PROTECTED_FIELDS) {
    delete (clean as Record<string, unknown>)[key];
  }
  return clean as any;
}
