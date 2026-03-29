import { defineModule } from '../registry.js';
import { dispatchRoutes } from './routes.js';

export default defineModule({
  name: 'dispatch',
  version: '1.0.0',
  dependencies: ['tickets'],
  register: async (fastify) => {
    await fastify.register(dispatchRoutes);
  },
});
