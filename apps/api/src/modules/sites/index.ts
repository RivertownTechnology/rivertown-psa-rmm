import { defineModule } from '../registry.js';
import { siteRoutes } from './routes.js';

export default defineModule({
  name: 'sites',
  version: '1.0.0',
  dependencies: ['customers'],
  register: async (fastify) => {
    await fastify.register(siteRoutes);
  },
});
