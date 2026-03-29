import { defineModule } from '../registry.js';
import { assetRoutes } from './routes.js';

export default defineModule({
  name: 'assets',
  version: '1.0.0',
  dependencies: ['customers'],
  register: async (fastify) => {
    await fastify.register(assetRoutes);
  },
});
