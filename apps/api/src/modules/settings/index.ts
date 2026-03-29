import { defineModule } from '../registry.js';
import { settingsRoutes } from './routes.js';

export default defineModule({
  name: 'settings',
  version: '1.0.0',
  register: async (fastify) => {
    await fastify.register(settingsRoutes);
  },
});
