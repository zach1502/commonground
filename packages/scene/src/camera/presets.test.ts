import { describe, expect, it } from 'vitest';

import { heightmapBounds } from '../geometry/sample.js';
import { heightmapFrom } from '../geometry/synthetic-heightmap.js';

import { boxCorners, FRAME_MARGIN, projectToScreen } from './fit.js';
import {
  cameraPreset,
  FIELD_OF_VIEW_DEG,
  clampPolarAngle,
  frameOn,
  MAX_POLAR_ANGLE_RAD,
  MIN_POLAR_ANGLE_RAD,
  polarAngleOf,
  PRESET_NAMES,
} from './presets.js';

const bounds = heightmapBounds(
  heightmapFrom({ width: 121, height: 81, resolutionM: 1 }, (x) => x * 0.1),
);
const centre = { x: 60, y: 6, z: 40 };

describe('clampPolarAngle', () => {
  it('keeps the camera off the zenith and above the horizon', () => {
    expect(clampPolarAngle(0)).toBe(MIN_POLAR_ANGLE_RAD);
    expect(clampPolarAngle(Math.PI)).toBe(MAX_POLAR_ANGLE_RAD);
    expect(clampPolarAngle(1)).toBe(1);
    expect(MAX_POLAR_ANGLE_RAD).toBeLessThan(Math.PI / 2);
  });
});

describe('cameraPreset', () => {
  it.each(PRESET_NAMES)('%s looks inside the parcel from inside the pitch clamp', (name) => {
    const pose = cameraPreset(name, bounds);
    // fitPose slides the target so the box is centred on screen; it stays over the parcel.
    expect(pose.target.x).toBeGreaterThan(bounds.minX);
    expect(pose.target.x).toBeLessThan(bounds.maxX);
    expect(pose.target.z).toBeGreaterThan(bounds.minZ);
    expect(pose.target.z).toBeLessThan(bounds.maxZ);
    expect(polarAngleOf(pose)).toBeGreaterThanOrEqual(MIN_POLAR_ANGLE_RAD - 1e-9);
    expect(polarAngleOf(pose)).toBeLessThanOrEqual(MAX_POLAR_ANGLE_RAD + 1e-9);
    const distance = Math.hypot(
      pose.position.x - pose.target.x,
      pose.position.y - pose.target.y,
      pose.position.z - pose.target.z,
    );
    expect(distance).toBeGreaterThan(Math.hypot(120, 80) / 2);
  });

  it('puts top-down straight above with north at the top of the screen', () => {
    const pose = cameraPreset('top-down', bounds);
    expect(polarAngleOf(pose)).toBeCloseTo(MIN_POLAR_ANGLE_RAD);
    expect(pose.position.z).toBeGreaterThan(centre.z);
    expect(pose.position.x).toBeCloseTo(centre.x);
  });

  it("views bird's eye more steeply than reset", () => {
    const reset = polarAngleOf(cameraPreset('reset', bounds));
    expect(polarAngleOf(cameraPreset('birds-eye', bounds))).toBeLessThan(reset);
  });
});

describe('frameOn', () => {
  const focus = { x: 12, y: 3, z: 18 };

  it('aims at the focus point from within the pitch clamp', () => {
    const pose = frameOn(focus, bounds);
    expect(pose.target).toEqual(focus);
    expect(polarAngleOf(pose)).toBeGreaterThanOrEqual(MIN_POLAR_ANGLE_RAD - 1e-9);
    expect(polarAngleOf(pose)).toBeLessThanOrEqual(MAX_POLAR_ANGLE_RAD + 1e-9);
    expect(pose.position.z).toBeGreaterThan(focus.z);
    expect(pose.position.y).toBeGreaterThan(focus.y);
  });

  it('sits closer than the reset view so the problem fills the frame', () => {
    const reach = (pose: { position: { x: number; y: number; z: number } }) =>
      Math.hypot(pose.position.x - focus.x, pose.position.y - focus.y, pose.position.z - focus.z);
    const reset = cameraPreset('reset', bounds);
    const resetReach = Math.hypot(
      reset.position.x - reset.target.x,
      reset.position.y - reset.target.y,
      reset.position.z - reset.target.z,
    );
    expect(reach(frameOn(focus, bounds))).toBeLessThan(resetReach);
  });
});

describe('the reset view framing', () => {
  const aspect = 16 / 10;
  const pose = cameraPreset('reset', bounds, aspect);

  it('looks down 32 degrees below the horizon with a 38 degree field of view', () => {
    expect(FIELD_OF_VIEW_DEG).toBe(38);
    expect(Math.PI / 2 - polarAngleOf(pose)).toBeCloseTo((32 * Math.PI) / 180);
  });

  it('keeps all 4 parcel corners inside the 8 percent margin', () => {
    const corners = boxCorners(bounds).filter((corner) => corner.y === bounds.minY);
    expect(corners).toHaveLength(4);
    corners.forEach((corner) => {
      const screen = projectToScreen(corner, pose, { fovDeg: FIELD_OF_VIEW_DEG, aspect });
      expect(Math.abs(screen.x)).toBeLessThanOrEqual(1 - FRAME_MARGIN + 1e-3);
      expect(Math.abs(screen.y)).toBeLessThanOrEqual(1 - FRAME_MARGIN + 1e-3);
    });
  });
});

describe('the top-down view in a wide band', () => {
  it('keeps every corner of the island on screen, so a heatmap is never cut off', () => {
    const aspect = 2;
    const pose = cameraPreset('top-down', bounds, aspect);
    boxCorners(bounds).forEach((corner) => {
      const screen = projectToScreen(corner, pose, { fovDeg: FIELD_OF_VIEW_DEG, aspect });
      expect(Math.abs(screen.y)).toBeLessThanOrEqual(1 - FRAME_MARGIN + 1e-3);
    });
  });
});
