import { describe, expect, it, vi } from 'vitest';

import { heightmapFrom } from '../geometry/synthetic-heightmap.js';

import { WalkEngine } from './walk-engine.js';
import { walkStepFor } from './walk-keys.js';
import type { WalkStart } from './walk-starts.js';

const flat = heightmapFrom({ width: 61, height: 61, resolutionM: 1 }, () => 5);
const world = {
  heightmap: flat,
  parcel: [
    { x: 0, z: 0 },
    { x: 60, z: 0 },
    { x: 60, z: 60 },
    { x: 0, z: 60 },
  ],
};
const starts: WalkStart[] = [
  { position: { x: 30, z: 2 }, headingRad: 0, kind: 'entrance' },
  { position: { x: 30, z: 58 }, headingRad: Math.PI, kind: 'entrance' },
];
const FPS = 60;
const first = { repeat: 'first' } as const;

function advanceFor(engine: WalkEngine, seconds: number): void {
  for (let frame = 0; frame < seconds * FPS; frame += 1) engine.advance(1 / FPS);
}

describe('walkStepFor', () => {
  it('maps W A S D and the arrows, in either case', () => {
    expect(['w', 'W', 'ArrowUp'].map(walkStepFor)).toEqual(['forward', 'forward', 'forward']);
    expect(['s', 'ArrowDown', 'a', 'd'].map(walkStepFor)).toEqual([
      'back',
      'back',
      'step-left',
      'step-right',
    ]);
    expect(['ArrowLeft', 'ArrowRight', 'q'].map(walkStepFor)).toEqual([
      'turn-left',
      'turn-right',
      undefined,
    ]);
  });
});

describe('WalkEngine', () => {
  it('starts at the first start point', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    expect(engine.state().position).toEqual({ x: 30, z: 2 });
  });

  it('walks while a key is held and stops when it is released', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    expect(engine.press('ArrowUp', first)).toBe('handled');
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(3.4, 3);
    engine.release('ArrowUp');
    expect(engine.live()).toBe('idle');
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(3.4, 3);
  });

  it('runs after toggleRun and walks again after a second toggleRun', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    engine.toggleRun();
    expect(engine.pace()).toBe('run');
    engine.press('W', first);
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(6.375, 3);
    engine.toggleRun();
    expect(engine.pace()).toBe('walk');
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(7.775, 3);
  });

  it('tells listeners when the pace changes', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.toggleRun();
    engine.setPace('run');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('steps 4 m per press under reduced motion and ignores key repeat', () => {
    const engine = new WalkEngine({ world, starts, motion: 'reduced' });
    engine.press('ArrowUp', first);
    engine.press('ArrowUp', { repeat: 'repeat' });
    advanceFor(engine, 1);
    expect(engine.state().position.z).toBeCloseTo(6, 6);
  });

  it('leaves keys it does not use to the page', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    expect(engine.press('Tab', first)).toBe('ignored');
  });
});

describe('WalkEngine taps and starts', () => {
  it('walks to a tapped point, or lands on it at once under reduced motion', () => {
    const full = new WalkEngine({ world, starts, motion: 'full' });
    full.walkTo({ x: 30, z: 4 });
    expect(full.live()).toBe('live');
    advanceFor(full, 2);
    expect(full.state().position.z).toBeCloseTo(4, 3);
    const reduced = new WalkEngine({ world, starts, motion: 'reduced' });
    reduced.walkTo({ x: 30, z: 4 });
    expect(reduced.state().position).toEqual({ x: 30, z: 4 });
  });

  it('refuses a tapped point outside the parcel', () => {
    const engine = new WalkEngine({ world, starts, motion: 'reduced' });
    engine.walkTo({ x: 30, z: -5 });
    expect(engine.state().position).toEqual({ x: 30, z: 2 });
  });

  it('cycles to the next start and tells listeners', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    const listener = vi.fn();
    engine.subscribe(listener);
    engine.next();
    expect(engine.state().position).toEqual({ x: 30, z: 58 });
    expect(engine.startIndex()).toBe(1);
    expect(engine.jumps()).toBe(1);
    expect(listener).toHaveBeenCalled();
    engine.next();
    expect(engine.startIndex()).toBe(0);
  });

  it('turns 45 degrees per button press', () => {
    const engine = new WalkEngine({ world, starts, motion: 'full' });
    engine.turn('left');
    expect(engine.state().headingRad).toBeCloseTo(Math.PI / 4, 6);
  });

  it('looks around by a drag, with the pitch clamped', () => {
    const engine = new WalkEngine({ world, starts, motion: 'reduced' });
    engine.look(0.5, 2);
    expect(engine.state().headingRad).toBeCloseTo(0.5, 6);
    expect(engine.state().pitchRad).toBeCloseTo(Math.PI / 6, 6);
  });
});
