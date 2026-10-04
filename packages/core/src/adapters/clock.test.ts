import { describe, expect, it } from 'vitest';

import { clockContract } from '../ports/__contracts__/clock.contract.js';

import { FakeClock } from './fake-clock.js';
import { SystemClock } from './system-clock.js';

const START_ISO = '2026-01-01T00:00:00.000Z';
const ONE_MINUTE_MS = 60_000;

clockContract('FakeClock', () => new FakeClock(new Date(START_ISO)));
clockContract('SystemClock', () => new SystemClock());

describe('FakeClock', () => {
  it('returns the fixed start until advanced', () => {
    const clock = new FakeClock(new Date(START_ISO));
    expect(clock.now().toISOString()).toBe(START_ISO);
    expect(clock.now().toISOString()).toBe(START_ISO);
    clock.advance(ONE_MINUTE_MS);
    expect(clock.now().toISOString()).toBe('2026-01-01T00:01:00.000Z');
  });

  it('returns copies so callers cannot mutate its state', () => {
    const clock = new FakeClock(new Date(START_ISO));
    clock.now().setTime(0);
    expect(clock.now().toISOString()).toBe(START_ISO);
  });
});

describe('SystemClock', () => {
  it('returns the current system time', () => {
    const before = Date.now();
    const now = new SystemClock().now().getTime();
    expect(now).toBeGreaterThanOrEqual(before);
    expect(now).toBeLessThanOrEqual(Date.now());
  });
});
