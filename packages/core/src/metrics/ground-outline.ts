import { polygonContains, type PlanePoint } from '../schema/geometry.js';
import { ringArea } from '../schema/polygon-clip.js';

import type { Heightmap } from './heightmap.js';

/**
 * The share of its grid box an outline must cover to draw as the whole box. Jonathan Rogers
 * Park covers 93 percent and has always drawn as its box; a triangle covers half.
 */
export const BOX_GROUND_MIN_SHARE = 0.85;

/**
 * Whether an outline covers so much of its box that it draws as the box. The box is the
 * outline's own bounding box unless an area is given, such as the heightmap grid's.
 */
export function fillsItsBox(outline: readonly PlanePoint[], boxAreaM2?: number): boolean {
  const xs = outline.map((point) => point.x);
  const ys = outline.map((point) => point.y);
  const ownBox = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  return ringArea(outline) >= (boxAreaM2 ?? ownBox) * BOX_GROUND_MIN_SHARE;
}

/**
 * The heightmap with the parcel outline it should draw inside. An outline that fills nearly all
 * of the grid box leaves the heightmap as the box, so a rectangular park looks as it always did.
 */
export function withGroundOutline(heightmap: Heightmap, outline: readonly PlanePoint[]): Heightmap {
  const boxArea =
    heightmap.width * heightmap.height * heightmap.resolutionM * heightmap.resolutionM;
  if (fillsItsBox(outline, boxArea)) {
    return heightmap.groundOutline === undefined
      ? heightmap
      : { ...heightmap, groundOutline: undefined };
  }
  return { ...heightmap, groundOutline: outline };
}

/** Whether a point is on the parcel's ground: inside the outline, or anywhere on a box grid. */
export function isOnGround(heightmap: Heightmap, point: PlanePoint): boolean {
  const outline = heightmap.groundOutline;
  return outline === undefined || polygonContains(outline, point);
}
