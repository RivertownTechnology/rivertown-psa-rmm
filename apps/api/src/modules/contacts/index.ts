import { defineModule } from '../registry.js';
import { contactRoutes } from './routes.js';

export default defineModule({
  name: 'contacts',
  version: '1.0.0',
  dependencies: ['customers'],
  register: async (fastify) => {
    await fastify.register(contactRoutes);
  },
});
