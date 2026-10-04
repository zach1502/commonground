import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatabaseUnavailableError } from '../../ports/availability.js';

import { DatabaseGate, guardMethods, isConnectionFailure } from './availability.js';

const QUERY_TIMEOUT_MS = 50;

/** What drizzle throws: its own error with the driver's error as the cause. */
function driverFailure(code: string): Error {
  return new Error('Failed query: select 1', { cause: Object.assign(new Error(code), { code }) });
}

function openGate(timeoutMs?: number): DatabaseGate {
  const gate = new DatabaseGate(timeoutMs === undefined ? {} : { timeoutMs });
  gate.open();
  return gate;
}

afterEach(() => {
  vi.useRealTimers();
});

describe('isConnectionFailure', () => {
  it.each(['ECONNREFUSED', 'ECONNRESET', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT', '57P01', '08006'])(
    'counts %s as a lost connection',
    (code) => {
      expect(isConnectionFailure(driverFailure(code))).toBe(true);
    },
  );

  it('leaves a unique violation and a plain error alone', () => {
    expect(isConnectionFailure(driverFailure('23505'))).toBe(false);
    expect(isConnectionFailure(new Error('boom'))).toBe(false);
    expect(isConnectionFailure('not an error')).toBe(false);
  });
});

describe('DatabaseGate', () => {
  it('refuses work before the database is open', async () => {
    const gate = new DatabaseGate({});
    await expect(gate.run(() => Promise.resolve(1))).rejects.toMatchObject({
      kind: 'database-unavailable',
      reason: 'not-connected',
    });
  });

  it('passes results and other errors through once open', async () => {
    const gate = openGate();
    await expect(gate.run(() => Promise.resolve(7))).resolves.toBe(7);
    const unique = driverFailure('23505');
    await expect(gate.run(() => Promise.reject(unique))).rejects.toBe(unique);
  });

  it('turns a driver connection failure into DatabaseUnavailableError', async () => {
    const gate = openGate();
    const failure = driverFailure('ECONNREFUSED');
    const error: unknown = await gate.run(() => Promise.reject(failure)).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(DatabaseUnavailableError);
    expect(error).toMatchObject({ reason: 'connection-lost', cause: failure });
  });
});

describe('DatabaseGate after a restart', () => {
  it.each(['57P01', '57P03'])('runs a call again once after a stale %s notice', async (code) => {
    const gate = openGate();
    let calls = 0;
    const work = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(driverFailure(code)) : Promise.resolve('voted');
    };
    await expect(gate.run(work)).resolves.toBe('voted');
    expect(calls).toBe(2);
  });

  it('does not run a call a third time when the server really is shutting down', async () => {
    const gate = openGate();
    let calls = 0;
    const work = () => {
      calls += 1;
      return Promise.reject(driverFailure('57P01'));
    };
    await expect(gate.run(work)).rejects.toBeInstanceOf(DatabaseUnavailableError);
    expect(calls).toBe(2);
  });

  it('does not run a call again for any other connection failure', async () => {
    const gate = openGate();
    let calls = 0;
    const work = () => {
      calls += 1;
      return Promise.reject(driverFailure('ECONNREFUSED'));
    };
    await expect(gate.run(work)).rejects.toBeInstanceOf(DatabaseUnavailableError);
    expect(calls).toBe(1);
  });
});

describe('DatabaseGate edge cases', () => {
  it('turns a synchronous throw into a rejection', async () => {
    const gate = openGate();
    await expect(
      gate.run(() => {
        throw driverFailure('CONNECTION_DESTROYED');
      }),
    ).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it('gives up on a query that never answers after the timeout', async () => {
    vi.useFakeTimers();
    const gate = openGate(QUERY_TIMEOUT_MS);
    const pending = gate.run(() => new Promise<never>(() => undefined));
    const assertion = expect(pending).rejects.toMatchObject({ reason: 'timed-out' });
    await vi.advanceTimersByTimeAsync(QUERY_TIMEOUT_MS);
    await assertion;
  });

  it('refuses work again once closed', async () => {
    const gate = openGate();
    gate.close();
    await expect(gate.run(() => Promise.resolve(1))).rejects.toMatchObject({
      reason: 'not-connected',
    });
  });
});

describe('guardMethods', () => {
  class Counter {
    count = 0;
    increment(by: number): Promise<number> {
      this.count += by;
      return Promise.resolve(this.count);
    }
    fail(): Promise<never> {
      return Promise.reject(driverFailure('57P01'));
    }
  }

  it('runs every method through the gate and keeps this bound', async () => {
    const counter = new Counter();
    const guarded = guardMethods(counter, openGate());
    await expect(guarded.increment(2)).resolves.toBe(2);
    expect(counter.count).toBe(2);
    await expect(guarded.fail()).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });

  it('refuses calls while the gate is shut', async () => {
    const guarded = guardMethods(new Counter(), new DatabaseGate({}));
    await expect(guarded.increment(1)).rejects.toBeInstanceOf(DatabaseUnavailableError);
  });
});
