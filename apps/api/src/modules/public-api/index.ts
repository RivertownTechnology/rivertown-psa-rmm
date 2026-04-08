import { ModuleDefinition } from '../registry.js';
import { publicApiRoutes } from './routes.js';

const publicApiModule: ModuleDefinition = {
  name: 'public-api',
  routes: publicApiRoutes,
  dependencies: ['customers', 'tickets'],
};

export default publicApiModule;
