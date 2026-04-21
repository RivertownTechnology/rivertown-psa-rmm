import { defineModule } from '../registry.js';
import { cannedResponseRoutes } from './routes.js';

export default defineModule({
  name: 'canned-responses',
  version: '1.0.0',
  dependencies: [],
  register: async (fastify) => {
    await fastify.register(cannedResponseRoutes);
  },
});
