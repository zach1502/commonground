import { describe, expect, it } from 'vitest';

import { cameraPreset, FIELD_OF_VIEW_DEG } from '../camera/presets.js';
import type { SceneBounds } from '../geometry/sample.js';

import { THUMBNAIL_HEIGHT, THUMBNAIL_WIDTH, framedCamera, thumbnailAspect } from './framing.js';

const flat: SceneBounds = { minX: 0, maxX: 176, minZ: 0, maxZ: 86, minY: 0, maxY: 0 };

describe('thumbnailAspect', () => {
  it('is the frame width over its height', () => {
    expect(thumbnailAspect()).toBeCloseTo(THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT);
  });
});

describe('framedCamera', () => {
  it('uses the reset view framing at the thumbnail aspect', () => {
    const camera = framedCamera(flat);
    const reset = cameraPreset('reset', flat, thumbnailAspect());
    expect(camera.position).toEqual(reset.position);
    expect(camera.target).toEqual(reset.target);
    expect(camera.fovDeg).toBe(FIELD_OF_VIEW_DEG);
    expect(camera.aspect).toBeCloseTo(thumbnailAspect());
  });

  it('looks down from above the ground', () => {
    const camera = framedCamera({ ...flat, minY: 10, maxY: 14 });
    expect(camera.position.y).toBeGreaterThan(14);
  });
});
