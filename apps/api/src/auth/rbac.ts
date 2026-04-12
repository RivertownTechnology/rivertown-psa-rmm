import { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { eq, and } from 'drizzle-orm';
import { ForbiddenError } from '../common/errors.js';
import { users } from '@rivertown/db';

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
  ],
  portal_user: [
    'portal:tickets:read',
    'portal:tickets:create',
    'portal:quotes:read',
    'portal:quotes:approve',
    'portal:invoices:read',
    'portal:invoices:pay',
    'portal:assets:read',
  ],
};

/**
 * Gate a route to ForgePSA internal super-admins only. Checks the DB rather
 * than trusting the JWT alone so revoking super-admin takes effect immediately.
 */
export function requireSuperAdmin(fastify: FastifyInstance) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const user = request.user as { sub?: string; tid?: string } | undefined;
    if (!user?.sub || !user?.tid) {
      reply.code(401).send({ error: 'UNAUTHORIZED' });
      return;
    }
    const [row] = await fastify.db
      .select({ isSuperAdmin: users.isSuperAdmin })
      .from(users)
      .where(and(eq(users.id, user.sub), eq(users.tenantId, user.tid)))
      .limit(1);
    if (!row?.isSuperAdmin) {
      reply.code(403).send({ error: 'FORBIDDEN', message: 'Super-admin access required' });
    }
  };
}

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
