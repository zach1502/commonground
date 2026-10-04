import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';

import { createAdaptorServer } from '@hono/node-server';

import type { Logger } from '@parkshape/ai';

/** A client that has not sent all its headers this long after connecting is dropped. */
export const HEADERS_TIMEOUT_MS = 10_000;
/**
 * A client that has not sent its whole request, body included, this long after connecting gets
 * 408 and is dropped. The largest body, a 1 MB thumbnail, needs about 270 kbit/s to arrive in
 * time. Node's default is 300 s, which let a slow client hold a socket for five minutes.
 */
export const REQUEST_TIMEOUT_MS = 30_000;
/** How often Node checks the two limits above; its default of 30 s could double them. */
export const TIMEOUT_CHECK_INTERVAL_MS = 1000;
/** On SIGTERM, requests in flight get this long to finish before their sockets are cut. */
export const SHUTDOWN_DRAIN_MS = 10_000;
/**
 * After a 413, the client gets this long to read the answer before its socket is cut. Without
 * it the Node adapter reads and discards up to 64 MB for 500 ms to reuse the socket. Closing at
 * once instead resets the connection, and the client can lose the 413 it had not read yet.
 */
export const REFUSED_BODY_LINGER_MS = 100;
const HTTP_PAYLOAD_TOO_LARGE = 413;
/** The exit code after an unhandled rejection or uncaught exception. */
export const EXIT_FATAL = 1;

export interface ServerTimeouts {
  readonly headersMs: number;
  readonly requestMs: number;
  readonly checkIntervalMs: number;
  readonly drainMs: number;
}

const DEFAULT_TIMEOUTS: ServerTimeouts = {
  headersMs: HEADERS_TIMEOUT_MS,
  requestMs: REQUEST_TIMEOUT_MS,
  checkIntervalMs: TIMEOUT_CHECK_INTERVAL_MS,
  drainMs: SHUTDOWN_DRAIN_MS,
};

export interface NodeServerOptions {
  readonly fetch: (request: Request) => Response | Promise<Response>;
  readonly port: number;
  readonly logger: Logger;
  /** Shorter limits for tests; production uses the named constants above. */
  readonly timeouts?: Partial<ServerTimeouts>;
}

/** Whether every request finished in the drain budget, or how many sockets were cut. */
export type ShutdownOutcome =
  { readonly kind: 'drained' } | { readonly kind: 'cut'; readonly connections: number };

export interface RunningServer {
  readonly port: number;
  /** Stops accepting, waits up to the drain budget for requests in flight, then cuts the rest. */
  shutdown(): Promise<ShutdownOutcome>;
}

function createServer(options: NodeServerOptions, timeouts: ServerTimeouts): Server {
  const server = createAdaptorServer({
    fetch: options.fetch,
    serverOptions: {
      headersTimeout: timeouts.headersMs,
      requestTimeout: timeouts.requestMs,
      connectionsCheckingInterval: timeouts.checkIntervalMs,
    },
  }) as Server;
  server.headersTimeout = timeouts.headersMs;
  server.requestTimeout = timeouts.requestMs;
  return server;
}

function listen(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => {
      server.off('error', reject);
      resolve((server.address() as AddressInfo).port);
    });
  });
}

/** Cuts the socket of a refused body shortly after the 413 is written, not after 64 MB. */
function cutRefusedBody(request: IncomingMessage, response: ServerResponse): void {
  response.once('finish', () => {
    if (response.statusCode !== HTTP_PAYLOAD_TOO_LARGE || request.complete) return;
    setTimeout(() => {
      request.socket.destroy();
    }, REFUSED_BODY_LINGER_MS).unref();
  });
}

/** Counts open requests, and closes each keep-alive socket once shutdown has begun. */
function trackRequests(server: Server) {
  const state = { active: 0, stopping: false };
  server.on('request', (request, response) => {
    cutRefusedBody(request, response);
    state.active += 1;
    response.once('close', () => {
      state.active -= 1;
      if (state.stopping) server.closeIdleConnections();
    });
  });
  return state;
}

function shutdownOf(server: Server, options: NodeServerOptions, drainMs: number) {
  const requests = trackRequests(server);
  let outcome: Promise<ShutdownOutcome> | undefined;
  const drain = () =>
    new Promise<ShutdownOutcome>((resolve) => {
      requests.stopping = true;
      const timer = setTimeout(() => {
        const cut = requests.active;
        options.logger.warn(
          `shutdown: ${String(cut)} request(s) still running after ${String(drainMs)} ms; ` +
            `cut ${String(cut)} connection(s).`,
        );
        server.closeAllConnections();
        resolve({ kind: 'cut', connections: cut });
      }, drainMs);
      server.close(() => {
        clearTimeout(timer);
        resolve({ kind: 'drained' });
      });
      server.closeIdleConnections();
    });
  return () => {
    outcome ??= drain();
    return outcome;
  };
}

/** Starts the Node HTTP server with bounded header, request and shutdown times. */
export async function startNodeServer(options: NodeServerOptions): Promise<RunningServer> {
  const timeouts = { ...DEFAULT_TIMEOUTS, ...options.timeouts };
  const server = createServer(options, timeouts);
  const shutdown = shutdownOf(server, options, timeouts.drainMs);
  const port = await listen(server, options.port);
  return { port, shutdown };
}

function describeFault(fault: unknown): string {
  if (fault instanceof Error) return fault.stack ?? `${fault.name}: ${fault.message}`;
  return String(fault);
}

export interface FatalHandlerDeps {
  readonly logger: Logger;
  readonly exit: (code: number) => void;
}

/** The part of `process` the fatal handlers listen on; tests pass an EventEmitter. */
export interface FaultSource {
  on(
    event: 'unhandledRejection' | 'uncaughtException',
    listener: (fault: unknown) => void,
  ): unknown;
}

/**
 * After an unhandled rejection or uncaught exception the process state is unknown, so it logs
 * the fault through the Logger port and exits non-zero for the host to restart it.
 */
export function installFatalHandlers(source: FaultSource, deps: FatalHandlerDeps): void {
  let exiting = false;
  const fail = (what: string) => (fault: unknown) => {
    if (exiting) return;
    exiting = true;
    deps.logger.warn(`fatal: ${what}: ${describeFault(fault)}`);
    deps.exit(EXIT_FATAL);
  };
  source.on('unhandledRejection', fail('unhandled rejection'));
  source.on('uncaughtException', fail('uncaught exception'));
}

export interface CloseLimit {
  readonly limitMs: number;
  readonly logger: Logger;
}

export type CloseOutcome = 'closed' | 'timed-out' | 'failed';

/**
 * Runs the container's close with a time limit, so a database pool whose end never answers
 * cannot hold the process until the host sends SIGKILL. The caller exits whatever it answers.
 */
export function closeWithin(close: () => Promise<void>, limit: CloseLimit): Promise<CloseOutcome> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      limit.logger.warn(`shutdown: close did not finish in ${String(limit.limitMs)} ms; exiting.`);
      resolve('timed-out');
    }, limit.limitMs);
    timer.unref();
    close().then(
      () => {
        clearTimeout(timer);
        resolve('closed');
      },
      (error: unknown) => {
        clearTimeout(timer);
        const reason = error instanceof Error ? error.message : String(error);
        limit.logger.warn(`shutdown: close failed: ${reason}`);
        resolve('failed');
      },
    );
  });
}
