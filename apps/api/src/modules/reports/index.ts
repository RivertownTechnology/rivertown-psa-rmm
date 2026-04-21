import { defineModule } from '../registry.js';
import { reportRoutes } from './routes.js';

export default defineModule({
  name: 'reports',
  version: '1.0.0',
  dependencies: ['tickets'],
  register: async (fastify) => {
    await fastify.register(reportRoutes);
  },
});
