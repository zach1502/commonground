import { PerspectiveCamera } from 'three';
import { describe, expect, it } from 'vitest';

import { pagePointOf } from './page-point.js';

const BOX = { left: 100, top: 50, width: 800, height: 600 };

function cameraLookingAtOrigin(): PerspectiveCamera {
  const camera = new PerspectiveCamera(45, BOX.width / BOX.height, 1, 1000);
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  return camera;
}

describe('pagePointOf', () => {
  it('puts the point the camera looks at in the middle of the canvas box', () => {
    const point = pagePointOf({ x: 0, y: 0, z: 0 }, cameraLookingAtOrigin(), BOX);
    expect(point?.x).toBeCloseTo(500);
    expect(point?.y).toBeCloseTo(350);
  });

  it('puts a point above the aim higher on the page', () => {
    const point = pagePointOf({ x: 0, y: 1, z: 0 }, cameraLookingAtOrigin(), BOX);
    expect(point?.y).toBeLessThan(350);
  });

  it('gives null for a point behind the camera', () => {
    expect(pagePointOf({ x: 0, y: 0, z: 20 }, cameraLookingAtOrigin(), BOX)).toBeNull();
  });
});
