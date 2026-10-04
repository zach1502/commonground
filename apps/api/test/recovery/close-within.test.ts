import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeWithin } from '../../src/node-server.js';

const LIMIT_MS = 10_000;

function recorder() {
  const lines: string[] = [];
  return { lines, logger: { warn: (line: string) => lines.push(line) } };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('closeWithin', () => {
  it('answers closed when the container closes inside the limit', async () => {
    const { lines, logger } = recorder();
    expect(await closeWithin(() => Promise.resolve(), { limitMs: LIMIT_MS, logger })).toBe(
      'closed',
    );
    expect(lines).toEqual([]);
  });

  it('gives up on a close that hangs once the limit passes, and says so', async () => {
    vi.useFakeTimers();
    const { lines, logger } = recorder();
    const hung = () => new Promise<void>(() => undefined);
    const outcome = closeWithin(hung, { limitMs: LIMIT_MS, logger });
    await vi.advanceTimersByTimeAsync(LIMIT_MS);
    expect(await outcome).toBe('timed-out');
    expect(lines).toEqual([`shutdown: close did not finish in ${String(LIMIT_MS)} ms; exiting.`]);
  });

  it('logs a close that fails and still lets the process exit', async () => {
    const { lines, logger } = recorder();
    const failing = () => Promise.reject(new Error('pool end failed'));
    expect(await closeWithin(failing, { limitMs: LIMIT_MS, logger })).toBe('failed');
    expect(lines).toEqual(['shutdown: close failed: pool end failed']);
  });
});
