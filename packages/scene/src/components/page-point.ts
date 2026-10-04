import { Vector3 } from 'three';
import type { Camera } from 'three';

const HALF = 0.5;

/** The page rectangle of the canvas, as getBoundingClientRect gives it. */
export interface PageBox {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Page coordinates of a scene point seen by the camera, or null when it is behind the camera. */
export function pagePointOf(
  world: { readonly x: number; readonly y: number; readonly z: number },
  camera: Camera,
  box: PageBox,
): { readonly x: number; readonly y: number } | null {
  const projected = new Vector3(world.x, world.y, world.z).project(camera);
  if (projected.z > 1) return null;
  return {
    x: box.left + (projected.x + 1) * HALF * box.width,
    y: box.top + (1 - projected.y) * HALF * box.height,
  };
}
