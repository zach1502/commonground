import { loadConfigFromProcess } from '@parkshape/config';

import { createApp } from './app.js';
import { consoleLogger, createApiContainer } from './container.js';
import {
  EXIT_FATAL,
  SHUTDOWN_DRAIN_MS,
  closeWithin,
  installFatalHandlers,
  startNodeServer,
} from './node-server.js';

const EXIT_OK = 0;
const logger = consoleLogger;
const exit = (code: number) => process.exit(code);
installFatalHandlers(process, { logger, exit });

// The handlers go in before anything slow, so a signal during boot is never the default kill.
// They stay installed: a host that repeats the signal during the drain must not cut it short.
let requestExit: (code: number) => void = () => undefined;
const exitRequested = new Promise<number>((resolve) => {
  requestExit = resolve;
});
process.on('SIGTERM', () => {
  requestExit(EXIT_OK);
});
process.on('SIGINT', () => {
  requestExit(EXIT_OK);
});

const config = loadConfigFromProcess();
const container = await createApiContainer(config, { logger });
// The boot retries ran out: exit for the host to restart the process with a fresh connection.
container.databaseReady.catch(() => {
  requestExit(EXIT_FATAL);
});
const server = await startNodeServer({
  fetch: createApp(container.deps).fetch,
  port: config.PORT,
  logger,
});
process.stdout.write(`api listening on http://localhost:${String(server.port)}\n`);

// Drains the server, then closes the worker pool and the database pool, then exits. The close
// gets its own drain-length limit, so a pool that never ends cannot wait for SIGKILL.
const EXIT_CODE = await exitRequested;
const outcome = await server.shutdown();
await closeWithin(() => container.close(), { limitMs: SHUTDOWN_DRAIN_MS, logger });
logger.warn(`shutdown: ${outcome.kind}; exiting with code ${String(EXIT_CODE)}.`);
exit(EXIT_CODE);
