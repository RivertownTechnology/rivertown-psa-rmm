import { defineModule } from '../registry.js';
import { serviceCatalogRoutes } from './routes.js';

export default defineModule({
  name: 'service-catalog',
  version: '1.0.0',
  register: async (fastify) => {
    await fastify.register(serviceCatalogRoutes);
  },
});
