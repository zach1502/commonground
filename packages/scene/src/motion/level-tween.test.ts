import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { BRUSH_AIMING_OPACITY, BRUSH_APPLYING_OPACITY, brushRingTween } from './level-tween.js';

const START = new Date('2026-10-01T12:00:00Z');

describe('brush ring opacity', () => {
  it('rests at 0.5 while the brush only aims', () => {
    const tween = brushRingTween('full', new FakeClock(START));
    expect(tween.value()).toBe(BRUSH_AIMING_OPACITY);
    expect(BRUSH_AIMING_OPACITY).toBe(0.5);
  });

  it('is 1 by 150 ms after pointerdown and back to 0.5 by 150 ms after pointerup', () => {
    const clock = new FakeClock(START);
    const tween = brushRingTween('full', clock);
    tween.to('applying');
    expect(tween.value()).toBe(BRUSH_AIMING_OPACITY);
    clock.advance(75);
    expect(tween.value()).toBeGreaterThan(BRUSH_AIMING_OPACITY);
    expect(tween.value()).toBeLessThan(BRUSH_APPLYING_OPACITY);
    clock.advance(75);
    expect(tween.value()).toBe(BRUSH_APPLYING_OPACITY);
    expect(tween.state()).toBe('done');
    tween.to('aiming');
    clock.advance(150);
    expect(tween.value()).toBe(BRUSH_AIMING_OPACITY);
  });

  it('turns back from where it is when the press ends early', () => {
    const clock = new FakeClock(START);
    const tween = brushRingTween('full', clock);
    tween.to('applying');
    clock.advance(50);
    const reached = tween.value();
    tween.to('aiming');
    expect(tween.value()).toBe(reached);
    clock.advance(150);
    expect(tween.value()).toBe(BRUSH_AIMING_OPACITY);
  });

  it('jumps at once under reduced motion', () => {
    const tween = brushRingTween('reduced', new FakeClock(START));
    tween.to('applying');
    expect(tween.value()).toBe(BRUSH_APPLYING_OPACITY);
  });
});
