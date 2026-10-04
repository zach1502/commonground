import { describe, expect, it } from 'vitest';

import { motionPreference, riseOffsetM } from './rise.js';

const rise = { durationMs: 250, depthM: 8 };

describe('riseOffsetM', () => {
  it('starts below its resting place and ends on it', () => {
    expect(riseOffsetM(0, { ...rise, motion: 'full' })).toBe(-8);
    expect(riseOffsetM(250, { ...rise, motion: 'full' })).toBe(0);
    expect(riseOffsetM(1000, { ...rise, motion: 'full' })).toBe(0);
  });

  it('rises without going back down', () => {
    const steps = [0, 50, 100, 150, 200, 250].map((ms) =>
      riseOffsetM(ms, { ...rise, motion: 'full' }),
    );
    steps.slice(1).forEach((value, index) => {
      expect(value).toBeGreaterThan(steps[index] ?? 0);
    });
  });

  it('skips the rise when the reader asks for reduced motion', () => {
    expect(riseOffsetM(0, { ...rise, motion: 'reduced' })).toBe(0);
  });
});

describe('motionPreference', () => {
  it('assumes full motion outside a browser', () => {
    expect(motionPreference()).toBe('full');
  });
});
