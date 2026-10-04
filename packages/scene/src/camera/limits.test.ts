import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';

import { cameraKeyStep } from './keyboard.js';
import { clampOrbit, orbitLimitsFor } from './limits.js';
import { cameraPreset, PRESET_NAMES, type CameraPose } from './presets.js';

const PARCEL = { minX: 0, maxX: 176, minZ: 0, maxZ: 86, minY: 20, maxY: 31 };
const GROUND_M = 24;
const ground = () => GROUND_M;
const ASPECT = 1.2;
const limits = orbitLimitsFor(PARCEL);
const STEPS = 50;
const SPHERE_RADIUS_M = Math.hypot(176, 86, 11) / 2;
const HALF_FOV_RAD = (38 / 2) * (Math.PI / 180);

const distanceOf = (pose: CameraPose) =>
  Math.hypot(
    pose.position.x - pose.target.x,
    pose.position.y - pose.target.y,
    pose.position.z - pose.target.z,
  );

const pose = (position: CameraPose['position'], target: CameraPose['target']): CameraPose => ({
  position,
  target,
});

describe('orbitLimitsFor (owner bug 4)', () => {
  it('lets the camera come to 4 m from its target', () => {
    expect(limits.minDistanceM).toBe(4);
  });

  it('reaches past every preset, so the whole parcel fits with room to spare', () => {
    for (const name of PRESET_NAMES) {
      expect(distanceOf(cameraPreset(name, PARCEL, ASPECT))).toBeLessThan(limits.maxDistanceM);
    }
  });

  it('stops well short of losing the park in the fog', () => {
    const reset = distanceOf(cameraPreset('reset', PARCEL, ASPECT));
    expect(limits.maxDistanceM).toBeLessThanOrEqual(reset * 2);
  });

  // Leftover B: the limit was 477 m at aspect 1.1 and 538 m on a 1440 by 900 window.
  it('gives the same far limit at aspects 0.8, 1.1 and 1.6, within 1 percent', () => {
    const [first = 0, ...rest] = [0.8, 1.1, 1440 / 900].map((aspect) => {
      const presets = PRESET_NAMES.map((name) => cameraPreset(name, PARCEL, aspect));
      expect(presets.every((preset) => distanceOf(preset) < limits.maxDistanceM)).toBe(true);
      return orbitLimitsFor(PARCEL).maxDistanceM;
    });
    for (const other of rest) expect(Math.abs(other - first) / first).toBeLessThan(0.01);
  });

  it('fits the bounding sphere at the vertical field of view, times 1.5', () => {
    const fit = SPHERE_RADIUS_M / Math.sin(HALF_FOV_RAD);
    expect(limits.maxDistanceM).toBeCloseTo(fit * 1.5, 3);
  });

  it('keeps the sphere inside the horizontal view at the far limit on a 0.7 aspect canvas', () => {
    const halfHorizontal = Math.atan(Math.tan(HALF_FOV_RAD) * 0.7);
    expect(SPHERE_RADIUS_M / Math.sin(halfHorizontal)).toBeLessThan(limits.maxDistanceM);
  });
});

describe('clampOrbit (owner bug 4)', () => {
  it('leaves a pose inside the limits alone', () => {
    const inside = pose({ x: 88, y: 120, z: 200 }, { x: 88, y: GROUND_M, z: 43 });
    expect(clampOrbit(inside, limits, ground)).toBeNull();
  });

  it('pushes a camera that came closer than 4 m back along its view line', () => {
    const close = pose({ x: 88, y: GROUND_M + 2, z: 44 }, { x: 88, y: GROUND_M, z: 43 });
    const fixed = clampOrbit(close, limits, ground);
    expect(fixed === null ? 0 : distanceOf(fixed)).toBeCloseTo(4);
  });

  it('pulls a camera past the far limit back in', () => {
    const far = pose({ x: 88, y: 900, z: 900 }, { x: 88, y: GROUND_M, z: 43 });
    const fixed = clampOrbit(far, limits, ground);
    expect(fixed === null ? Infinity : distanceOf(fixed)).toBeCloseTo(limits.maxDistanceM);
  });

  it('keeps the camera above the ground', () => {
    const under = pose({ x: 88, y: GROUND_M - 6, z: 60 }, { x: 88, y: GROUND_M + 3, z: 43 });
    const fixed = clampOrbit(under, limits, ground);
    expect(fixed?.position.y).toBeGreaterThanOrEqual(GROUND_M + limits.clearanceM);
  });

  it('keeps the target inside the island box, so a pan cannot lose the park', () => {
    const lost = pose({ x: 500, y: 300, z: 400 }, { x: 480, y: -400, z: 380 });
    const fixed = clampOrbit(lost, limits, ground);
    const box = limits.targetBox;
    expect(fixed?.target.y).toBeGreaterThanOrEqual(box.minY);
    expect(fixed?.target.x).toBeLessThanOrEqual(PARCEL.maxX);
    expect(fixed?.target.z).toBeLessThanOrEqual(PARCEL.maxZ);
  });

  it('lifts a close-up target that sits under the ground, so a zoom in ends on the grass', () => {
    const buried = pose({ x: 88, y: GROUND_M + 3, z: 46 }, { x: 88, y: GROUND_M - 9, z: 43 });
    const fixed = clampOrbit(buried, limits, ground);
    expect(fixed?.target.y).toBeGreaterThanOrEqual(GROUND_M - 1.5);
    expect(fixed?.position.y).toBeGreaterThan(fixed?.target.y ?? Infinity);
  });

  it('leaves every preset where it is', () => {
    for (const name of PRESET_NAMES) {
      expect(clampOrbit(cameraPreset(name, PARCEL, ASPECT), limits, ground)).toBeNull();
    }
  });
});

describe('the plus and minus keys under the limits (owner bug 4)', () => {
  const press = (start: CameraPose, key: string): CameraPose => {
    let current = start;
    for (let step = 0; step < STEPS; step += 1) {
      const move = cameraKeyStep(
        {
          position: new Vector3().copy(current.position),
          target: new Vector3().copy(current.target),
        },
        key,
        'released',
      );
      if (move === null) throw new Error(`no move for ${key}`);
      current = clampOrbit(move, limits, ground) ?? move;
    }
    return current;
  };
  const start = cameraPreset('reset', PARCEL, ASPECT);

  it('stays at 4 m or more after 50 presses of plus', () => {
    expect(distanceOf(press(start, '+'))).toBeGreaterThanOrEqual(limits.minDistanceM - 1e-6);
  });

  it('stays within the far limit after 50 presses of minus', () => {
    expect(distanceOf(press(start, '-'))).toBeLessThanOrEqual(limits.maxDistanceM + 1e-6);
  });
});
