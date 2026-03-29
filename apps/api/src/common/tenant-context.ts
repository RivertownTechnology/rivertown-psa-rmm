import { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
  }
}

export const tenantContextPlugin = fp(async (fastify: FastifyInstance) => {
  fastify.decorateRequest('tenantId', '');

  fastify.addHook('preHandler', async (request: FastifyRequest) => {
    // Skip tenant extraction for public routes
    if ((request.routeOptions?.config as unknown as Record<string, unknown>)?.public) return;

    const user = request.user as { tid?: string } | undefined;
    if (user?.tid) {
      request.tenantId = user.tid;
    }
  });
});
