import { defineModule } from '../registry.js';
import { rmmRoutes } from './routes.js';
import { agentDistributionRoutes } from './agent-distribution.js';

export default defineModule({
  name: 'rmm',
  version: '1.0.0',
  dependencies: ['customers', 'assets'],
  register: async (fastify) => {
    await fastify.register(rmmRoutes);
    await fastify.register(agentDistributionRoutes);
  },
});
