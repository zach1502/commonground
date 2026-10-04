import type { ScenePalette } from '../palette/colours.js';

/** DESIGN.md "Editing": the ghost is tinted success or danger and holds a fixed 0.5 opacity. */
export const GHOST_OPACITY = 0.5;
/** The reason label sits this far right of and below the cursor, clear of the model. */
export const REASON_OFFSET_PX = 12;
/** The selection outline, drawn in the BC focus colour. */
export const SELECTION_OUTLINE_PX = 2;
/** The brush ring and the light halo under it, so it shows on grass. */
export const BRUSH_RING_PX = 2;
export const BRUSH_HALO_PX = 5;
// The ground ring sits this far outside the footprint's corners.
const RING_CLEARANCE_M = 0.4;
// The smallest ring, so a tree trunk's ring still shows from the reset view.
const MIN_RING_RADIUS_M = 1.5;
const HALF = 0.5;
const STRAIGHT_ANGLE_DEG = 180;
// The field of view spans both sides of the view axis.
const BOTH_SIDES = 2;

/** DESIGN.md "Placing items": the ghost's marker ring never shows under 24 px across. */
export const GHOST_MIN_PX = 24;

export function ghostColour(validity: { readonly valid: boolean }, palette: ScenePalette): string {
  return validity.valid ? palette.success : palette.danger;
}

/** Radius of the ground ring around a selected item: just outside its footprint corners. */
export function selectionRingRadiusM(footprint: {
  readonly widthM: number;
  readonly depthM: number;
}): number {
  const around = Math.hypot(footprint.widthM, footprint.depthM) * HALF + RING_CLEARANCE_M;
  return Math.max(around, MIN_RING_RADIUS_M);
}

/** Where the camera sits relative to a point on the ground, and the canvas it draws to. */
export interface ScreenScale {
  readonly distanceM: number;
  readonly fovDeg: number;
  readonly viewportHeightPx: number;
}

/** Metres one CSS pixel spans at this distance from a perspective camera. */
export function metresPerPixel(view: ScreenScale): number {
  const halfFov = ((view.fovDeg * Math.PI) / STRAIGHT_ANGLE_DEG) * HALF;
  return (BOTH_SIDES * view.distanceM * Math.tan(halfFov)) / Math.max(view.viewportHeightPx, 1);
}

/**
 * Radius of the ring around the placing ghost: just outside its footprint when the camera is
 * close, and wide enough to span GHOST_MIN_PX when it is far. The ghost mesh keeps its real size.
 */
export function ghostMarkerRadiusM(
  footprint: { readonly widthM: number; readonly depthM: number },
  view: ScreenScale,
): number {
  const around = Math.hypot(footprint.widthM, footprint.depthM) * HALF + RING_CLEARANCE_M;
  return Math.max(around, GHOST_MIN_PX * HALF * metresPerPixel(view));
}
