import { defineModule } from '../registry.js';
import { attachmentRoutes } from './routes.js';

export default defineModule({
  name: 'attachments',
  version: '1.0.0',
  dependencies: [],
  register: async (fastify) => {
    await fastify.register(attachmentRoutes);
  },
});
