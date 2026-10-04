import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { pathTickOf, PathTickTween } from './path-tick.js';

const START = new Date('2026-10-01T12:00:00Z');
const A = { x: 0, y: 0 };
const B = { x: 10, y: 0 };
const C = { x: 10, y: 10 };

describe('PathTickTween', () => {
  it('grows the segment from scale 0 at t=0 to 1 at 150 ms, and fades the point in with it', () => {
    const clock = new FakeClock(START);
    const tween = new PathTickTween('full', clock);
    expect(tween.look()).toEqual({ scale: 0, opacity: 0 });
    clock.advance(75);
    expect(tween.look().scale).toBeGreaterThan(0);
    expect(tween.look().scale).toBeLessThan(1);
    clock.advance(75);
    expect(tween.look()).toEqual({ scale: 1, opacity: 1 });
    expect(tween.state()).toBe('done');
  });

  it('shows the full segment at once under reduced motion', () => {
    expect(new PathTickTween('reduced', new FakeClock(START)).look()).toEqual({
      scale: 1,
      opacity: 1,
    });
  });
});

describe('pathTickOf', () => {
  it('ticks the newest point and the segment it made', () => {
    expect(pathTickOf([A, B, C], 2)).toEqual({ index: 2, from: B, to: C });
  });

  it('ticks a first point with no segment', () => {
    expect(pathTickOf([A], 0)).toEqual({ index: 0, from: null, to: A });
  });

  it('has nothing to tick when no point was added, such as after Backspace', () => {
    expect(pathTickOf([A, B], 2)).toBeNull();
    expect(pathTickOf([A], 2)).toBeNull();
  });
});
