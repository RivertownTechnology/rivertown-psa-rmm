import { defineModule } from '../registry.js';
import { ticketRoutes } from './routes.js';

export default defineModule({
  name: 'tickets',
  version: '1.0.0',
  dependencies: ['customers'],
  register: async (fastify) => {
    await fastify.register(ticketRoutes);
  },
});
