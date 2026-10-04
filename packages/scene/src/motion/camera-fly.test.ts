import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { flyCamera } from './camera-fly.js';
import { cameraMoverFor } from './camera-move.js';

const TO = { position: { x: 40, y: 60, z: 20 }, target: { x: 10, y: 2, z: 10 } };

function setup() {
  const camera = new PerspectiveCamera();
  camera.position.set(0, 100, 0);
  const controls = { target: new Vector3(), update: vi.fn() };
  return { camera, controls, invalidate: vi.fn() };
}

describe('flyCamera', () => {
  it('starts a flight from the current pose and leaves the camera where it is this frame', () => {
    const { camera, controls, invalidate } = setup();
    flyCamera({ camera, controls, to: TO, motion: 'full', invalidate });
    expect(cameraMoverFor(camera).state()).toBe('moving');
    expect(camera.position.toArray()).toEqual([0, 100, 0]);
    expect(invalidate).toHaveBeenCalled();
  });

  it('puts the camera on the pose at once under reduced motion', () => {
    const { camera, controls, invalidate } = setup();
    flyCamera({ camera, controls, to: TO, motion: 'reduced', invalidate });
    expect(cameraMoverFor(camera).state()).toBe('idle');
    expect(camera.position.toArray()).toEqual([40, 60, 20]);
    expect(controls.target.toArray()).toEqual([10, 2, 10]);
    expect(controls.update).toHaveBeenCalled();
  });

  it('stops a flight in progress when a reduced-motion move lands', () => {
    const { camera, controls, invalidate } = setup();
    flyCamera({ camera, controls, to: TO, motion: 'full', invalidate });
    flyCamera({ camera, controls, to: TO, motion: 'reduced', invalidate });
    expect(cameraMoverFor(camera).step()).toBeNull();
  });
});
