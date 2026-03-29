import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fjwt from '@fastify/jwt';
import { Config } from '../config.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: {
      sub: string;
      tid: string;
      role: string;
      type: 'access' | 'refresh' | 'mfa_challenge';
      cid?: string; // customerId — used by portal tokens
    };
    user: {
      sub: string;
      tid: string;
      role: string;
      type: 'access' | 'refresh' | 'mfa_challenge';
      cid?: string;
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
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
      if (request.user.type !== 'access') {
        reply.code(401).send({ error: 'Invalid token type' });
      }
    } catch (err) {
      reply.code(401).send({ error: 'Unauthorized' });
    }
  });
});
