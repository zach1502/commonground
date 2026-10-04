import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { Tween, tweenProgress } from './tween.js';

const START = new Date('2026-10-01T12:00:00Z');

describe('tweenProgress', () => {
  it('is 0 at the start, part way in the middle and 1 at the end', () => {
    const options = { durationMs: 150, curve: 'entry', motion: 'full' } as const;
    expect(tweenProgress(0, options)).toBe(0);
    expect(tweenProgress(75, options)).toBeGreaterThan(0.5);
    expect(tweenProgress(75, options)).toBeLessThan(1);
    expect(tweenProgress(150, options)).toBe(1);
    expect(tweenProgress(300, options)).toBe(1);
  });

  it('is 1 at once under reduced motion', () => {
    expect(tweenProgress(0, { durationMs: 150, curve: 'entry', motion: 'reduced' })).toBe(1);
  });
});

describe('Tween', () => {
  it('reads progress from the clock it was given', () => {
    const clock = new FakeClock(START);
    const tween = new Tween({ durationMs: 400, curve: 'move', motion: 'full' }, clock);
    expect(tween.progress()).toBe(0);
    expect(tween.state()).toBe('running');
    clock.advance(200);
    expect(tween.progress()).toBeGreaterThan(0);
    expect(tween.progress()).toBeLessThan(1);
    clock.advance(200);
    expect(tween.progress()).toBe(1);
    expect(tween.state()).toBe('done');
  });

  it('is done on the first read under reduced motion', () => {
    const tween = new Tween(
      { durationMs: 400, curve: 'move', motion: 'reduced' },
      new FakeClock(START),
    );
    expect(tween.progress()).toBe(1);
    expect(tween.state()).toBe('done');
  });
});
