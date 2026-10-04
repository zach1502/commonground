import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { cameraKeyStep } from './keyboard.js';

const start = { position: new Vector3(0, 40, 40), target: new Vector3(0, 0, 0) };
const distance = (move: { position: Vector3; target: Vector3 }) =>
  move.position.distanceTo(move.target);

describe('cameraKeyStep', () => {
  it('orbits around the target on a plain arrow key, keeping the view distance', () => {
    const move = cameraKeyStep(start, 'ArrowLeft', 'released');
    expect(move).not.toBeNull();
    expect(move?.position.x).not.toBeCloseTo(start.position.x);
    expect(distance(move ?? start)).toBeCloseTo(distance(start), 3);
    expect(move?.target).toEqual(start.target);
  });

  it('pans the target across the ground when Shift is held', () => {
    const move = cameraKeyStep(start, 'ArrowRight', 'held');
    expect(move).not.toBeNull();
    expect(move?.target.equals(start.target)).toBe(false);
    expect(distance(move ?? start)).toBeCloseTo(distance(start), 3);
  });

  it('zooms in on plus and out on minus', () => {
    const near = cameraKeyStep(start, '+', 'released');
    const far = cameraKeyStep(start, '-', 'released');
    expect(distance(near ?? start)).toBeLessThan(distance(start));
    expect(distance(far ?? start)).toBeGreaterThan(distance(start));
  });

  it('returns null for a key that does not move the camera', () => {
    expect(cameraKeyStep(start, 'a', 'released')).toBeNull();
    expect(cameraKeyStep(start, 'Enter', 'held')).toBeNull();
  });
});
