import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it, vi } from 'vitest';

import { captureOrbit, restoreOrbit, walkPose } from './walk-session.js';

describe('captureOrbit and restoreOrbit', () => {
  it('puts the overview camera back exactly where it was', () => {
    const camera = new PerspectiveCamera(38, 1.6, 1, 5000);
    camera.position.set(12.5, 80.25, -40.125);
    const controls = { target: new Vector3(30, 2, 40), update: vi.fn(), enabled: true };
    camera.lookAt(controls.target);
    const before = camera.quaternion.clone();
    const saved = captureOrbit(camera, controls);
    camera.position.set(1, 1.6, 1);
    controls.target.set(2, 1.6, 2);
    camera.lookAt(controls.target);
    restoreOrbit(camera, controls, saved);
    expect(camera.position.toArray()).toEqual([12.5, 80.25, -40.125]);
    expect(controls.target.toArray()).toEqual([30, 2, 40]);
    expect(camera.quaternion.angleTo(before)).toBeCloseTo(0, 9);
    expect(controls.update).toHaveBeenCalled();
  });

  it('keeps its own copy, so later camera moves do not change the saved pose', () => {
    const camera = new PerspectiveCamera();
    camera.position.set(5, 6, 7);
    const controls = { target: new Vector3(1, 2, 3), update: vi.fn(), enabled: true };
    const saved = captureOrbit(camera, controls);
    camera.position.set(0, 0, 0);
    controls.target.set(0, 0, 0);
    expect(saved).toEqual({ position: { x: 5, y: 6, z: 7 }, target: { x: 1, y: 2, z: 3 } });
  });
});

describe('walkPose', () => {
  it('aims one metre ahead of the eye along the heading and pitch', () => {
    const pose = walkPose(
      { x: 0, y: 1.6, z: 0 },
      { position: { x: 0, z: 0 }, headingRad: 0, pitchRad: 0 },
    );
    expect(pose.target.z - pose.position.z).toBeCloseTo(1, 9);
    expect(pose.target.y).toBeCloseTo(1.6, 9);
  });
});
