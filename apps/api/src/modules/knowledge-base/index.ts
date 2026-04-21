import { defineModule } from '../registry.js';
import { knowledgeBaseRoutes } from './routes.js';

export default defineModule({
  name: 'knowledge-base',
  version: '1.0.0',
  dependencies: [],
  register: async (fastify) => {
    await fastify.register(knowledgeBaseRoutes);
  },
});
