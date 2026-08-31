import { defineModule } from '../registry.js';
import { agreementRoutes } from './routes.js';

export default defineModule({
  name: 'agreements',
  version: '1.0.0',
  dependencies: ['customers'],
  register: async (fastify) => {
    await fastify.register(agreementRoutes);
  },
});
