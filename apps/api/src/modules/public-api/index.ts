import { defineModule } from '../registry.js';
import { publicApiRoutes } from './routes.js';

export default defineModule({
  name: 'public-api',
  version: '1.0.0',
  dependencies: ['customers', 'tickets'],
  register: async (fastify) => {
    await fastify.register(publicApiRoutes);
  },
});
