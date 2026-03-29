import { defineModule } from '../registry.js';
import { quoteRoutes } from './routes.js';

export default defineModule({
  name: 'quotes',
  version: '1.0.0',
  dependencies: ['customers', 'contracts'],
  register: async (fastify) => {
    await fastify.register(quoteRoutes);
  },
});
