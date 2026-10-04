import { describe, expect, it } from 'vitest';

import { elevationAt } from '../geometry/sample.js';
import { heightmapFrom } from '../geometry/synthetic-heightmap.js';

import {
  EYE_HEIGHT_M,
  eyeOf,
  groundHit,
  lookBy,
  stepToward,
  stepWalker,
  stepWalkerOnce,
  stepWalkerStick,
  type WalkerState,
  type WalkInput,
  type WalkWorld,
} from './walk.js';

// A 60 m square that rises 0.1 m per metre to the east.
const slope = heightmapFrom({ width: 61, height: 61, resolutionM: 1 }, (x) => 10 + 0.1 * x);
const square = [
  { x: 0, z: 0 },
  { x: 60, z: 0 },
  { x: 60, z: 60 },
  { x: 0, z: 60 },
];
const world: WalkWorld = { heightmap: slope, parcel: square };
const still: WalkInput = { forward: 0, strafe: 0, turn: 0, pace: 'walk' };
const facingNorth = { position: { x: 30, z: 30 }, headingRad: 0, pitchRad: 0 };
const FPS = 60;

/** Steps the walker frame by frame for a number of seconds, as the render loop does. */
function walkFor(state: WalkerState, input: WalkInput, seconds: number): WalkerState {
  let next = state;
  for (let frame = 0; frame < seconds * FPS; frame += 1) {
    next = stepWalker(next, input, 1 / FPS, world);
  }
  return next;
}

describe('stepWalker', () => {
  it('walks forward at 1.4 m/s along the heading', () => {
    const next = walkFor(facingNorth, { ...still, forward: 1 }, 1);
    expect(next.position.x).toBeCloseTo(30, 6);
    expect(next.position.z).toBeCloseTo(31.4, 6);
  });

  it('walks back and steps sideways at the same pace', () => {
    const back = walkFor(facingNorth, { ...still, forward: -1 }, 1);
    expect(back.position.z).toBeCloseTo(28.6, 6);
    const right = walkFor(facingNorth, { ...still, strafe: 1 }, 1);
    expect(Math.hypot(right.position.x - 30, right.position.z - 30)).toBeCloseTo(1.4, 6);
    expect(right.position.z).toBeCloseTo(30, 6);
  });

  it('runs at 3.125 times the pace when running is on', () => {
    const next = walkFor(facingNorth, { ...still, forward: 1, pace: 'run' }, 1);
    expect(next.position.z).toBeCloseTo(34.375, 6);
  });

  it('turns at 90 degrees per second without moving', () => {
    const next = walkFor(facingNorth, { ...still, turn: 1 }, 1);
    expect(Math.abs(next.headingRad)).toBeCloseTo(Math.PI / 2, 6);
    expect(next.position).toEqual(facingNorth.position);
  });

  it('keeps the eye 1.6 m above the terrain it stands on', () => {
    const next = walkFor({ ...facingNorth, headingRad: Math.PI / 2 }, { ...still, forward: 1 }, 2);
    const eye = eyeOf(next, world);
    expect(eye.y).toBeCloseTo(elevationAt(slope, next.position) + EYE_HEIGHT_M, 6);
    expect(eye.y).toBeGreaterThan(eyeOf(facingNorth, world).y);
  });

  it('stops at the parcel edge and slides along it', () => {
    const atEdge = { ...facingNorth, position: { x: 30, z: 59.5 }, headingRad: Math.PI / 4 };
    const next = walkFor(atEdge, { ...still, forward: 1 }, 1);
    expect(next.position.z).toBeLessThanOrEqual(60);
    // The full step along the edge survives: 1.4 m at 45 degrees is 0.99 m east.
    expect(next.position.x).toBeCloseTo(30.99, 2);
  });

  it('never leaves the parcel however long it walks into a corner', () => {
    const state = walkFor(
      { ...facingNorth, headingRad: Math.PI / 4 },
      { ...still, forward: 1, pace: 'run' },
      20,
    );
    expect(state.position.x).toBeLessThanOrEqual(60);
    expect(state.position.z).toBeLessThanOrEqual(60);
    expect(state.position.x).toBeGreaterThan(55);
  });

  it('caps a long frame so a stalled tab does not jump the walker', () => {
    const next = stepWalker(facingNorth, { ...still, forward: 1 }, 5, world);
    expect(next.position.z - 30).toBeLessThan(1);
  });
});

describe('lookBy', () => {
  it('clamps the pitch to 30 degrees up or down', () => {
    expect(lookBy(facingNorth, 0, 2).pitchRad).toBeCloseTo(Math.PI / 6, 6);
    expect(lookBy(facingNorth, 0, -2).pitchRad).toBeCloseTo(-Math.PI / 6, 6);
  });
});

describe('stepWalkerOnce', () => {
  it('moves 4 m per press and turns 45 degrees per press under reduced motion', () => {
    const ahead = stepWalkerOnce(facingNorth, 'forward', world);
    expect(ahead.position.z).toBeCloseTo(34, 6);
    const turned = stepWalkerOnce(facingNorth, 'turn-left', world);
    expect(Math.abs(turned.headingRad)).toBeCloseTo(Math.PI / 4, 6);
  });

  it('stays inside the parcel when a 4 m step would leave it', () => {
    const atEdge = { ...facingNorth, position: { x: 30, z: 58 } };
    expect(stepWalkerOnce(atEdge, 'forward', world).position).toEqual(atEdge.position);
  });
});

describe('stepToward', () => {
  it('walks to a tapped point and reports when it arrives', () => {
    const target = { x: 30, z: 32 };
    let step = stepToward(facingNorth, target, 1 / FPS, world);
    expect(step.arrived).toBe('walking');
    for (let frame = 0; frame < 2 * FPS && step.arrived === 'walking'; frame += 1) {
      step = stepToward(step.state, target, 1 / FPS, world);
    }
    expect(step.arrived).toBe('arrived');
    expect(step.state.position.z).toBeCloseTo(32, 6);
  });
});

describe('groundHit', () => {
  it('finds where a downward ray meets the terrain', () => {
    const eye = eyeOf(facingNorth, world);
    const hit = groundHit(eye, { x: 0, y: -1, z: 1 }, slope);
    expect(hit?.z).toBeCloseTo(30 + EYE_HEIGHT_M, 1);
  });

  it('misses when the ray points at the sky', () => {
    expect(groundHit(eyeOf(facingNorth, world), { x: 0, y: 1, z: 0 }, slope)).toBeUndefined();
  });
});

describe('stepWalkerStick', () => {
  it('walks at the share of walking pace the pad is pushed, along the heading', () => {
    let next: WalkerState = facingNorth;
    for (let frame = 0; frame < FPS; frame += 1) {
      next = stepWalkerStick(next, { forward: 0.5, strafe: 0, pace: 'walk' }, 1 / FPS, world);
    }
    expect(next.position.z).toBeCloseTo(30.7, 3);
    expect(next.position.x).toBeCloseTo(30, 6);
  });

  it('never walks faster than walking pace when pushed past the rim', () => {
    const next = stepWalkerStick(facingNorth, { forward: 3, strafe: 4, pace: 'walk' }, 1, world);
    const moved = Math.hypot(next.position.x - 30, next.position.z - 30);
    expect(moved).toBeCloseTo(0.14, 3);
  });

  it('runs at running pace when running is on', () => {
    const next = stepWalkerStick(facingNorth, { forward: 1, strafe: 0, pace: 'run' }, 0.1, world);
    expect(next.position.z - 30).toBeCloseTo(0.4375, 3);
  });

  it('stops at the parcel edge as the keys do', () => {
    let next: WalkerState = { ...facingNorth, position: { x: 30, z: 59.5 } };
    for (let frame = 0; frame < FPS * 10; frame += 1) {
      next = stepWalkerStick(next, { forward: 1, strafe: 0, pace: 'walk' }, 1 / FPS, world);
    }
    expect(next.position.z).toBeLessThanOrEqual(60);
    expect(next.position.z).toBeGreaterThan(59);
  });
});
