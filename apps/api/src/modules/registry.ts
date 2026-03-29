import { FastifyInstance } from 'fastify';
import { EventEmitter } from 'events';
import TypedEmitter from 'events';

export interface RivertownModule {
  name: string;
  version: string;
  dependencies?: string[];
  register: (fastify: FastifyInstance) => Promise<void>;
}

export function defineModule(module: RivertownModule): RivertownModule {
  return module;
}

// Topological sort for module dependency resolution
function topologicalSort(modules: RivertownModule[]): RivertownModule[] {
  const moduleMap = new Map(modules.map((m) => [m.name, m]));
  const visited = new Set<string>();
  const sorted: RivertownModule[] = [];

  function visit(name: string, stack: Set<string> = new Set()) {
    if (visited.has(name)) return;
    if (stack.has(name)) {
      throw new Error(`Circular dependency detected: ${[...stack, name].join(' -> ')}`);
    }

    stack.add(name);
    const mod = moduleMap.get(name);
    if (!mod) throw new Error(`Module not found: ${name}`);

    for (const dep of mod.dependencies || []) {
      if (!moduleMap.has(dep)) {
        throw new Error(`Module "${name}" depends on "${dep}" which is not registered`);
      }
      visit(dep, new Set(stack));
    }

    visited.add(name);
    sorted.push(mod);
  }

  for (const mod of modules) {
    visit(mod.name);
  }

  return sorted;
}

export async function loadModules(fastify: FastifyInstance, modules: RivertownModule[]) {
  const sorted = topologicalSort(modules);
  for (const mod of sorted) {
    fastify.log.info(`Loading module: ${mod.name}@${mod.version}`);
    await fastify.register(mod.register, { prefix: '' });
  }
}

// Typed event bus for inter-module communication
export const moduleEvents = new EventEmitter();
moduleEvents.setMaxListeners(50);
