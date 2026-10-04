import { describe, expect, it } from 'vitest';

import { SHUTDOWN_DRAIN_MS } from '../../src/node-server.js';

import { chunk, rawClient } from './raw-client.js';
import { ENTRY_IS_BUILT, spawnEntry } from './spawn-entry.js';

const OK = 200;
const UNAVAILABLE = 503;
// Start-up, pool close and exit on a loaded machine, on top of the drain budget.
const EXIT_SLACK_MS = 5000;
const SLOW_BODY_PAUSE_MS = 300;
const SPAWN_TEST_TIMEOUT_MS = 40_000;
const LOGIN_BODY = '{"persona":"persona-molly-swingset"}';
const CHUNKED_LOGIN =
  'POST /auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n' +
  'Transfer-Encoding: chunked\r\n\r\n';

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A sign-in whose body arrives in two halves; the request is in flight until the second. */
async function startSlowLogin(port: number) {
  const client = await rawClient(port);
  const bytes = Buffer.from(LOGIN_BODY);
  const half = Math.floor(bytes.length / 2);
  await client.write(CHUNKED_LOGIN);
  await client.write(chunk(bytes.subarray(0, half)));
  const finish = async () => {
    await client.write(chunk(bytes.subarray(half)));
    await client.write('0\r\n\r\n');
  };
  return { client, finish };
}

describe.skipIf(!ENTRY_IS_BUILT)('the built Node entry', () => {
  it(
    'on SIGTERM lets an in-flight request finish, then exits 0 within the drain budget',
    async () => {
      const entry = await spawnEntry();
      const slow = await startSlowLogin(entry.port);
      await pause(SLOW_BODY_PAUSE_MS);
      const signalled = performance.now();
      entry.child.kill('SIGTERM');
      await pause(SLOW_BODY_PAUSE_MS);
      await expect(fetch(`http://127.0.0.1:${String(entry.port)}/health`)).rejects.toThrow();
      await slow.finish();
      await slow.client.closed;
      expect(slow.client.received()).toMatch(/^HTTP\/1\.1 200/);
      const { code, signal, afterMs } = await entry.exited(signalled);
      expect({ code, signal }).toEqual({ code: 0, signal: null });
      expect(afterMs).toBeLessThan(SHUTDOWN_DRAIN_MS);
      expect(entry.stderr()).toMatch(/shutdown: drained/);
    },
    SPAWN_TEST_TIMEOUT_MS,
  );

  it(
    'on SIGTERM cuts a request still running at the drain budget, logs it, and exits 0',
    async () => {
      const entry = await spawnEntry();
      const stuck = await startSlowLogin(entry.port);
      const signalled = performance.now();
      entry.child.kill('SIGTERM');
      // A host that repeats the signal during the drain must not kill the process early.
      await pause(SLOW_BODY_PAUSE_MS);
      entry.child.kill('SIGTERM');
      const { code, signal, afterMs } = await entry.exited(signalled);
      await stuck.client.closed;
      expect({ code, signal }).toEqual({ code: 0, signal: null });
      expect(afterMs).toBeGreaterThanOrEqual(SHUTDOWN_DRAIN_MS);
      expect(afterMs).toBeLessThan(SHUTDOWN_DRAIN_MS + EXIT_SLACK_MS);
      expect(entry.stderr()).toMatch(/shutdown: 1 request\(s\) still running.*cut 1 connection/);
    },
    SPAWN_TEST_TIMEOUT_MS,
  );

  it(
    'starts with its database refusing connections: /health 200, /ready 503',
    async () => {
      const entry = await spawnEntry({
        DATABASE_URL: 'postgres://parkshape@127.0.0.1:1/parkshape',
      });
      const base = `http://127.0.0.1:${String(entry.port)}`;
      expect((await fetch(`${base}/health`)).status).toBe(OK);
      expect((await fetch(`${base}/ready`)).status).toBe(UNAVAILABLE);
      expect(entry.stderr()).toMatch(/database: attempt 1 of \d+ failed \(ECONNREFUSED\)/);
      const signalled = performance.now();
      entry.child.kill('SIGTERM');
      expect((await entry.exited(signalled)).code).toBe(0);
    },
    SPAWN_TEST_TIMEOUT_MS,
  );
});
