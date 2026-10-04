import { THUMBNAIL_HEIGHT_PX, THUMBNAIL_WIDTH_PX } from '@parkshape/core';

import { cameraPreset, FIELD_OF_VIEW_DEG } from '../camera/presets.js';
import type { SceneBounds } from '../geometry/sample.js';
import type { Vector3 } from '../types.js';

/** The fixed pixel size of a stored design thumbnail, shared with the API's queue poster. */
export const THUMBNAIL_WIDTH = THUMBNAIL_WIDTH_PX;
export const THUMBNAIL_HEIGHT = THUMBNAIL_HEIGHT_PX;

/** A perspective camera framed on a parcel, ready to hand to the offscreen renderer. */
export interface ThumbnailCamera {
  readonly position: Vector3;
  readonly target: Vector3;
  readonly fovDeg: number;
  readonly aspect: number;
}

/** Width over height of the thumbnail frame. */
export function thumbnailAspect(): number {
  return THUMBNAIL_WIDTH / THUMBNAIL_HEIGHT;
}

/** The viewer's reset view at the thumbnail's aspect, so a thumbnail matches the 3D view. */
export function framedCamera(
  bounds: SceneBounds,
  aspect: number = thumbnailAspect(),
): ThumbnailCamera {
  return { ...cameraPreset('reset', bounds, aspect), fovDeg: FIELD_OF_VIEW_DEG, aspect };
}
