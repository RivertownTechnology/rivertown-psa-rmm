import { defineModule } from '../registry.js';
import { contractRoutes } from './routes.js';

export default defineModule({
  name: 'contracts',
  version: '1.0.0',
  dependencies: ['customers'],
  register: async (fastify) => {
    await fastify.register(contractRoutes);
  },
});
