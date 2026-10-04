import { afterEach, describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';

import { createApp } from '../../src/app.js';
import { createInMemoryDeps } from '../../src/container.js';
import { MAX_BODY_BYTES } from '../../src/middleware/http.js';
import {
  HEADERS_TIMEOUT_MS,
  REQUEST_TIMEOUT_MS,
  SHUTDOWN_DRAIN_MS,
  startNodeServer,
  type RunningServer,
  type ServerTimeouts,
} from '../../src/node-server.js';

import { chunk, rawClient } from './raw-client.js';

const SECRET = 'recovery-test-secret-of-32-characters';
const MB = 1024 * 1024;
const TEN_MB = 10 * MB;
const CHUNK_BYTES = 64 * 1024;
// The Node adapter reads and discards a refused body this long unless the server cuts it first.
const ADAPTER_DRAIN_MS = 500;
const QUICK: Partial<ServerTimeouts> = { headersMs: 300, requestMs: 600, checkIntervalMs: 50 };
const CLOSE_BUDGET_MS = 3000;
const DRAIN_MS = 400;

const lines: string[] = [];
const logger = { warn: (line: string) => lines.push(line) };
const servers: RunningServer[] = [];

async function serve(fetch: (request: Request) => Response | Promise<Response>, timeouts = {}) {
  const running = await startNodeServer({ fetch, port: 0, logger, timeouts });
  servers.push(running);
  return running;
}

function apiFetch() {
  return createApp(createInMemoryDeps(loadConfig({ AUTH_SECRET: SECRET }))).fetch;
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map((running) => running.shutdown()));
  lines.length = 0;
});

describe('server timeouts', () => {
  it('names each limit, keeping the header limit inside the request limit', () => {
    expect(HEADERS_TIMEOUT_MS).toBeLessThanOrEqual(REQUEST_TIMEOUT_MS);
    expect(SHUTDOWN_DRAIN_MS).toBeGreaterThan(0);
  });

  it('drops a client that sends part of its headers and stalls', async () => {
    const running = await serve(apiFetch(), QUICK);
    const client = await rawClient(running.port);
    await client.write('POST /auth/login HTTP/1.1\r\nHost: localhost\r\n');
    expect(await client.closed).toBeLessThan(CLOSE_BUDGET_MS);
  });

  it('drops a client that sends its headers, then stalls on the body', async () => {
    const running = await serve(apiFetch(), QUICK);
    const client = await rawClient(running.port);
    await client.write(
      'POST /auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n' +
        'Content-Length: 40\r\n\r\n{"persona":',
    );
    expect(await client.closed).toBeLessThan(CLOSE_BUDGET_MS);
    expect(client.received()).toMatch(/^HTTP\/1\.1 408/);
  });
});

describe('body limit on a real socket', () => {
  it('refuses a declared 10 MB body with 413 without reading it', async () => {
    const running = await serve(apiFetch());
    const client = await rawClient(running.port);
    await client.write(
      `POST /auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n` +
        `Content-Length: ${String(TEN_MB)}\r\n\r\n{"persona":"`,
    );
    await client.closed;
    expect(client.received()).toMatch(/^HTTP\/1\.1 413/);
  });

  it('answers a chunked 10 MB body with 413 and closes before the client has sent it all', async () => {
    const running = await serve(apiFetch());
    const client = await rawClient(running.port);
    await client.write(
      'POST /auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n' +
        'Transfer-Encoding: chunked\r\n\r\n',
    );
    const opened = performance.now();
    const filler = new Uint8Array(CHUNK_BYTES).fill('a'.charCodeAt(0));
    let sent = 0;
    while (sent < TEN_MB && !client.socket.destroyed) {
      await client.write(chunk(filler));
      sent += CHUNK_BYTES;
    }
    await client.closed;
    const closedAfterMs = performance.now() - opened;
    expect(client.received()).toMatch(/^HTTP\/1\.1 413/);
    expect(client.received()).toMatch(/payload-too-large/);
    expect(sent).toBeGreaterThan(MAX_BODY_BYTES);
    expect(sent).toBeLessThan(TEN_MB);
    expect(closedAfterMs).toBeLessThan(ADAPTER_DRAIN_MS);
  });
});

describe('shutdown', () => {
  it('stops accepting, lets an in-flight request finish, then resolves', async () => {
    let finish: () => void = () => undefined;
    let arrived: () => void = () => undefined;
    const arrival = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const running = await serve(
      async () => {
        arrived();
        await new Promise<void>((resolve) => {
          finish = resolve;
        });
        return new Response('done');
      },
      { drainMs: CLOSE_BUDGET_MS },
    );
    const inflight = fetch(`http://127.0.0.1:${String(running.port)}/slow`);
    await arrival;
    const stopping = running.shutdown();
    await expect(fetch(`http://127.0.0.1:${String(running.port)}/late`)).rejects.toThrow();
    finish();
    expect(await (await inflight).text()).toBe('done');
    expect(await stopping).toEqual({ kind: 'drained' });
  });

  it('cuts a request still running at the drain budget and says so', async () => {
    let arrived: () => void = () => undefined;
    const arrival = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    const running = await serve(
      () => {
        arrived();
        return new Promise<Response>(() => undefined);
      },
      { drainMs: DRAIN_MS },
    );
    const stuck = fetch(`http://127.0.0.1:${String(running.port)}/stuck`).catch((e: unknown) => e);
    await arrival;
    const started = performance.now();
    expect(await running.shutdown()).toEqual({ kind: 'cut', connections: 1 });
    expect(performance.now() - started).toBeGreaterThanOrEqual(DRAIN_MS - 1);
    expect(await stuck).toBeInstanceOf(Error);
    expect(lines.some((line) => /shutdown.*cut 1 connection/.test(line))).toBe(true);
  });
});
