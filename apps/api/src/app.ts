import { loadConfig } from './config.js';
import { buildServer } from './server.js';

async function main() {
  const config = loadConfig();
  const server = await buildServer(config);

  try {
    await server.listen({ port: config.PORT, host: config.HOST });
    server.log.info(`Server listening on http://${config.HOST}:${config.PORT}`);
  } catch (err) {
    server.log.fatal(err);
    process.exit(1);
  }

  // Graceful shutdown
  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      server.log.info(`Received ${signal}, shutting down...`);
      await server.close();
      process.exit(0);
    });
  }
}

main();
