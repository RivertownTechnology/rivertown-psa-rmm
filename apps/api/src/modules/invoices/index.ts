import { defineModule } from '../registry.js';
import { invoiceRoutes } from './routes.js';

export default defineModule({
  name: 'invoices',
  version: '1.0.0',
  dependencies: ['customers', 'contracts'],
  register: async (fastify) => {
    await fastify.register(invoiceRoutes);
  },
});
