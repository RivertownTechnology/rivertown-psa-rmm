import { FastifyRequest, FastifyReply } from 'fastify';
import { ForbiddenError } from '../common/errors.js';

const rolePermissions: Record<string, string[]> = {
  owner: ['*'],
  admin: ['*'],
  tech: [
    'tickets:read',
    'tickets:write',
    'customers:read',
    'customers:write',
    'contacts:read',
    'sites:read',
    'assets:read',
    'assets:write',
    'time-entries:write',
    'contracts:read',
    'quotes:read',
    'invoices:read',
    'compliance:read',
    'compliance:write',
  ],
  portal_user: [
    'portal:tickets:read',
    'portal:tickets:create',
    'portal:quotes:read',
    'portal:quotes:approve',
    'portal:invoices:read',
    'portal:invoices:pay',
    'portal:assets:read',
    'portal:compliance:read',
    'portal:compliance:upload',
  ],
};

export function requirePermission(...permissions: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { role?: string } | undefined;
    if (!user?.role) {
      throw new ForbiddenError();
    }

    const allowed = rolePermissions[user.role] || [];
    if (allowed.includes('*')) return;

    const hasPermission = permissions.some((p) => allowed.includes(p));
    if (!hasPermission) {
      throw new ForbiddenError(`Missing required permission: ${permissions.join(' or ')}`);
    }
  };
}
