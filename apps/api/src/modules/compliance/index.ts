import { defineModule } from '../registry.js';
import { complianceRoutes } from './routes.js';

export default defineModule({
  name: 'compliance',
  version: '1.0.0',
  register: async (fastify) => {
    await fastify.register(complianceRoutes);
  },
});
