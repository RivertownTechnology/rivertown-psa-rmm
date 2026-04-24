import { defineModule } from '../registry.js';
import { govContractRoutes } from './routes.js';

export default defineModule({
  name: 'gov-contracts',
  version: '1.0.0',
  register: async (fastify) => {
    await fastify.register(govContractRoutes);
  },
});
