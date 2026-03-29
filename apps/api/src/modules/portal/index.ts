import { defineModule } from '../registry.js';
import { portalRoutes } from './routes.js';

export default defineModule({
  name: 'portal',
  version: '1.0.0',
  register: async (fastify) => {
    await fastify.register(portalRoutes);
  },
});
