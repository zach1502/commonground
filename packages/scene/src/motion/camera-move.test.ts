import { describe, expect, it } from 'vitest';

import { FakeClock } from '@parkshape/core';

import { CameraMover, cameraMoverFor, cameraPoseAt } from './camera-move.js';

const START = new Date('2026-10-01T12:00:00Z');
const FROM = { position: { x: 0, y: 100, z: 0 }, target: { x: 0, y: 0, z: 0 } };
const TO = { position: { x: 40, y: 60, z: 20 }, target: { x: 10, y: 2, z: 10 } };

describe('cameraPoseAt', () => {
  it('blends position and target together', () => {
    expect(cameraPoseAt(FROM, TO, 0)).toEqual(FROM);
    expect(cameraPoseAt(FROM, TO, 1)).toEqual(TO);
    expect(cameraPoseAt(FROM, TO, 0.5).target).toEqual({ x: 5, y: 1, z: 5 });
  });
});

describe('CameraMover', () => {
  it('samples the 400 ms move at 0, 200 and 400 ms on the move curve', () => {
    const clock = new FakeClock(START);
    const mover = new CameraMover(clock);
    mover.start({ from: FROM, to: TO, motion: 'full' });
    expect(mover.step()).toEqual(FROM);
    clock.advance(200);
    const middle = mover.step();
    // The move curve is at 0.8778 halfway; the camera is most of the way there.
    expect(middle?.position.x).toBeCloseTo(40 * 0.8778, 1);
    expect(middle?.target.z).toBeCloseTo(10 * 0.8778, 1);
    expect(mover.state()).toBe('moving');
    clock.advance(200);
    expect(mover.step()).toEqual(TO);
    expect(mover.state()).toBe('idle');
    expect(mover.step()).toBeNull();
  });

  it('lands on the final pose in the first frame under reduced motion', () => {
    const mover = new CameraMover(new FakeClock(START));
    mover.start({ from: FROM, to: TO, motion: 'reduced' });
    expect(mover.step()).toEqual(TO);
    expect(mover.state()).toBe('idle');
  });

  it('stops where it is when input cancels it', () => {
    const clock = new FakeClock(START);
    const mover = new CameraMover(clock);
    mover.start({ from: FROM, to: TO, motion: 'full' });
    clock.advance(100);
    mover.step();
    mover.cancel();
    expect(mover.state()).toBe('idle');
    clock.advance(300);
    expect(mover.step()).toBeNull();
  });

  it('starts a new move from the pose it is handed, replacing the one in flight', () => {
    const clock = new FakeClock(START);
    const mover = new CameraMover(clock);
    mover.start({ from: FROM, to: TO, motion: 'full' });
    clock.advance(100);
    mover.start({ from: TO, to: FROM, motion: 'full' });
    expect(mover.step()).toEqual(TO);
    clock.advance(400);
    expect(mover.step()).toEqual(FROM);
  });
});

describe('cameraMoverFor', () => {
  it('gives one mover per camera, so a preset and Show me share it', () => {
    const camera = {};
    expect(cameraMoverFor(camera)).toBe(cameraMoverFor(camera));
    expect(cameraMoverFor({})).not.toBe(cameraMoverFor(camera));
  });
});
