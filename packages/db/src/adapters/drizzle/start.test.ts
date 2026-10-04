import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { refusingConnection } from '../../testing/refusing-connection.js';

import { backoffDelays, DATABASE_RETRY, startDatabase, type RetryPolicy } from './start.js';

const deps = { clock: new FakeClock(new Date('2026-09-01T00:00:00Z')), newId: () => 'user-1' };
const MEMORY = { DATABASE_URL: 'pglite://memory' };
const QUICK_RETRY: RetryPolicy = { attempts: 3, firstDelayMs: 10, maxDelayMs: 40 };

/** A wait the test releases by hand, recording each delay it was asked for. */
function manualWait() {
  const delays: number[] = [];
  const releases: (() => void)[] = [];
  const wait = (ms: number) => {
    delays.push(ms);
    return new Promise<void>((resolve) => releases.push(resolve));
  };
  const releaseNext = async () => {
    releases.shift()?.();
    await new Promise((resolve) => setImmediate(resolve));
  };
  return { wait, delays, releaseNext };
}

function recordingLogger() {
  const lines: string[] = [];
  return { lines, logger: { warn: (line: string) => lines.push(line) } };
}

describe('backoffDelays', () => {
  it('doubles from the first delay, stops at the cap, and has one delay per retry', () => {
    expect(backoffDelays({ attempts: 6, firstDelayMs: 100, maxDelayMs: 500 })).toEqual([
      100, 200, 400, 500, 500,
    ]);
  });

  it('keeps the default policy bounded', () => {
    const total = backoffDelays(DATABASE_RETRY).reduce((sum, ms) => sum + ms, 0);
    expect(DATABASE_RETRY.attempts).toBeGreaterThan(1);
    expect(total).toBeLessThanOrEqual(DATABASE_RETRY.maxDelayMs * DATABASE_RETRY.attempts);
  });
});

describe('startDatabase', () => {
  it('opens at once when the first migration works', async () => {
    const { logger, lines } = recordingLogger();
    const database = await startDatabase(MEMORY, deps, { logger });
    await database.ready;
    expect(await database.readiness()).toEqual({ kind: 'ready' });
    expect(lines).toEqual([]);
    await database.close();
  });

  it('starts while the database refuses, reports unavailable, then opens on a retry', async () => {
    const { logger, lines } = recordingLogger();
    const clock = manualWait();
    const database = await startDatabase(MEMORY, deps, {
      logger,
      retry: QUICK_RETRY,
      wait: clock.wait,
      connect: refusingConnection({ refusals: 1 }),
    });
    expect(await database.readiness()).toMatchObject({ kind: 'unavailable' });
    await expect(database.users.findById('user-1')).rejects.toMatchObject({
      kind: 'database-unavailable',
    });
    expect(lines[0]).toMatch(/attempt 1 of 3.*retrying in 10 ms/);
    await clock.releaseNext();
    await database.ready;
    expect(await database.readiness()).toEqual({ kind: 'ready' });
    expect(await database.users.findById('user-1')).toBeUndefined();
    await database.close();
  });
});

describe('startDatabase when the retries run out', () => {
  it('gives up after the last attempt and says so', async () => {
    const { logger, lines } = recordingLogger();
    const clock = manualWait();
    const database = await startDatabase(MEMORY, deps, {
      logger,
      retry: QUICK_RETRY,
      wait: clock.wait,
      connect: refusingConnection({ refusals: QUICK_RETRY.attempts }),
    });
    const outcome = database.ready.catch((error: unknown) => error);
    await clock.releaseNext();
    await clock.releaseNext();
    expect(await outcome).toMatchObject({ kind: 'database-unavailable' });
    expect(clock.delays).toEqual([10, 20]);
    expect(lines.at(-1)).toMatch(/gave up after 3 attempts/);
    expect(await database.readiness()).toMatchObject({ kind: 'unavailable' });
    await database.close();
  });

  it('stops retrying when closed', async () => {
    const { logger } = recordingLogger();
    const clock = manualWait();
    const database = await startDatabase(MEMORY, deps, {
      logger,
      retry: QUICK_RETRY,
      wait: clock.wait,
      connect: refusingConnection({ refusals: QUICK_RETRY.attempts }),
    });
    const outcome = database.ready.catch((error: unknown) => error);
    await database.close();
    await clock.releaseNext();
    expect(await outcome).toMatchObject({ kind: 'database-unavailable' });
    expect(clock.delays).toEqual([10]);
  });
});
