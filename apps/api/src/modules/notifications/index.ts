import { defineModule } from '../registry.js';
import { notificationRoutes } from './routes.js';

export default defineModule({
  name: 'notifications',
  version: '1.0.0',
  dependencies: [],
  register: async (fastify) => {
    await fastify.register(notificationRoutes);
  },
});
