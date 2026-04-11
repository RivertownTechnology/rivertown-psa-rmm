import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fjwt from '@fastify/jwt';
import { Config } from '../config.js';
import { isTokenBlacklisted } from '../common/token-blacklist.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      jti?: string;
      exp?: number;
      sub: string;
      tid: string;
      role: string;
      type: 'access' | 'refresh' | 'mfa_challenge' | 'preview' | 'invoice_view';
      cid?: string; // customerId — used by portal tokens
      resource?: string; // scoped resource — used by preview tokens
      portalRole?: string; // 'admin' | 'user' — portal contacts only
      perms?: string[]; // ['tickets', 'billing'] — portal permissions
      invoiceId?: string; // invoice view tokens
    };
    user: {
      jti?: string;
      exp?: number;
      sub: string;
      tid: string;
      role: string;
      type: 'access' | 'refresh' | 'mfa_challenge' | 'preview' | 'invoice_view';
      cid?: string;
      resource?: string;
      portalRole?: string;
      perms?: string[];
      invoiceId?: string;
    };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export const jwtPlugin = fp(async (fastify: FastifyInstance, opts: { config: Config }) => {
  await fastify.register(fjwt, {
    secret: opts.config.JWT_SECRET,
    sign: { algorithm: 'HS256' },
    verify: { algorithms: ['HS256'] },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (request.user.type !== 'access') {
        return reply.code(401).send({ error: 'Invalid token type' });
      }

      // Check token blacklist (logout)
      if (request.user.jti) {
        const blacklisted = await isTokenBlacklisted(request.user.jti);
        if (blacklisted) {
          return reply.code(401).send({ error: 'Token has been revoked' });
        }
      }
    } catch (err) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});
