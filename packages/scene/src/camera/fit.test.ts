import { describe, expect, it } from 'vitest';

import type { SceneBounds } from '../geometry/sample.js';

import { fitPose, FRAME_FILL, FRAME_MARGIN, projectToScreen, screenExtent } from './fit.js';

const parcel: SceneBounds = { minX: 0, maxX: 176, minZ: 0, maxZ: 86, minY: 14, maxY: 23 };
const lens = { fovDeg: 38, aspect: 16 / 10 };
const target = { x: 88, y: 18.5, z: 43 };

function poseAt(distance: number, direction: { x: number; y: number; z: number }) {
  return {
    target,
    position: {
      x: target.x + direction.x * distance,
      y: target.y + direction.y * distance,
      z: target.z + direction.z * distance,
    },
  };
}

describe('projectToScreen', () => {
  it('puts the target in the middle of the screen', () => {
    const pose = poseAt(100, { x: 0, y: 0.6, z: 0.8 });
    const centre = projectToScreen(target, pose, lens);
    expect(centre.x).toBeCloseTo(0);
    expect(centre.y).toBeCloseTo(0);
  });
});

// The reset view: 32 degrees down, from the south-east.
const RESET_PITCH = (32 * Math.PI) / 180;
const RESET_HEADING = Math.PI / 4;
const direction = {
  x: Math.cos(RESET_PITCH) * Math.sin(RESET_HEADING),
  y: Math.sin(RESET_PITCH),
  z: Math.cos(RESET_PITCH) * Math.cos(RESET_HEADING),
};

describe('fitPose', () => {
  const widthShare = (aspect: number) => {
    const frameLens = { ...lens, aspect };
    const extent = screenExtent(parcel, fitPose(parcel, direction, frameLens), frameLens);
    return (extent.right - extent.left) / 2;
  };

  it('fills 70 to 80 percent of a 16 by 10 canvas and keeps every corner inside the margin', () => {
    const pose = fitPose(parcel, direction, lens);
    const extent = screenExtent(parcel, pose, lens);
    expect(widthShare(lens.aspect)).toBeGreaterThanOrEqual(FRAME_FILL.min - 1e-3);
    expect(widthShare(lens.aspect)).toBeLessThanOrEqual(FRAME_FILL.max + 1e-3);
    expect(extent.top).toBeLessThanOrEqual(1 - FRAME_MARGIN + 1e-3);
    expect(extent.bottom).toBeGreaterThanOrEqual(-(1 - FRAME_MARGIN) - 1e-3);
  });

  it('centres the box on the screen', () => {
    const extent = screenExtent(parcel, fitPose(parcel, direction, lens), lens);
    expect((extent.left + extent.right) / 2).toBeCloseTo(0, 2);
    expect((extent.top + extent.bottom) / 2).toBeCloseTo(0, 2);
  });
});

describe('fitPose on canvases of each shape', () => {
  const inMargin = (extent: ReturnType<typeof screenExtent>) =>
    Math.max(-extent.left, extent.right, extent.top, -extent.bottom) <= 1 - FRAME_MARGIN + 1e-3;
  const bindingShare = (extent: ReturnType<typeof screenExtent>) =>
    Math.max(extent.right - extent.left, extent.top - extent.bottom) / 2;

  it.each([
    ['16:9', 16 / 9],
    ['4:3', 4 / 3],
    ['9:16', 9 / 16],
    ['3.2:1', 3.2],
  ])(
    'shows the whole box on a %s canvas, filling 70 to 78 percent of the axis that binds',
    (_, aspect) => {
      const frameLens = { ...lens, aspect };
      const extent = screenExtent(parcel, fitPose(parcel, direction, frameLens), frameLens);
      expect(inMargin(extent)).toBe(true);
      expect(bindingShare(extent)).toBeGreaterThanOrEqual(FRAME_FILL.min - 1e-3);
      expect(bindingShare(extent)).toBeLessThanOrEqual(FRAME_FILL.max + 1e-3);
    },
  );

  it('fits the height, not the width, when the canvas is wide', () => {
    const band = { ...lens, aspect: 3.2 };
    const extent = screenExtent(parcel, fitPose(parcel, direction, band), band);
    expect((extent.top - extent.bottom) / 2).toBeCloseTo(FRAME_FILL.max, 2);
    expect((extent.right - extent.left) / 2).toBeLessThan(FRAME_FILL.min);
  });

  it('keeps the whole box in a portrait frame', () => {
    const portrait = { ...lens, aspect: 0.5 };
    const extent = screenExtent(parcel, fitPose(parcel, direction, portrait), portrait);
    expect(Math.max(-extent.left, extent.right, extent.top, -extent.bottom)).toBeLessThanOrEqual(
      1 - FRAME_MARGIN + 1e-3,
    );
  });
});

describe('fitPose on tall canvases', () => {
  const shares = (aspect: number) => {
    const frameLens = { ...lens, aspect };
    const extent = screenExtent(parcel, fitPose(parcel, direction, frameLens), frameLens);
    return {
      extent,
      width: (extent.right - extent.left) / 2,
      height: (extent.top - extent.bottom) / 2,
    };
  };

  it.each([
    ['9:16', 9 / 16],
    ['the 360 by 740 phone page', 360 / 740],
    ['a square stage', 1],
  ])('fits the width on %s, filling 70 to 80 percent of the shorter axis', (_, aspect) => {
    const { width, height } = shares(aspect);
    expect(width).toBeGreaterThanOrEqual(0.7 - 1e-3);
    expect(width).toBeLessThanOrEqual(0.8 + 1e-3);
    expect(width).toBeCloseTo(FRAME_FILL.max, 2);
    expect(height).toBeLessThan(width);
  });

  it('keeps the park centred and every corner in the margin on a 9:16 canvas', () => {
    const { extent } = shares(9 / 16);
    expect((extent.left + extent.right) / 2).toBeCloseTo(0, 2);
    expect((extent.top + extent.bottom) / 2).toBeCloseTo(0, 2);
    expect(Math.max(-extent.left, extent.right, extent.top, -extent.bottom)).toBeLessThanOrEqual(
      1 - FRAME_MARGIN + 1e-3,
    );
  });
});
