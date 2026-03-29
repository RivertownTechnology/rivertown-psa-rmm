import { defineModule } from '../registry.js';
import { customerRoutes } from './routes.js';

export default defineModule({
  name: 'customers',
  version: '1.0.0',
  register: async (fastify) => {
    await fastify.register(customerRoutes);
  },
});
