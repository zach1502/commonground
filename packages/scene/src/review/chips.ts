import {
  anchorPoint,
  COMMENT_CHIP_MAX_DISTANCE_M,
  type DesignDocument,
  type PlanePoint,
} from '@parkshape/core';

import type { Vector3 } from '../types.js';

/** Past this many chips on screen, only the busiest show. */
const CHIP_CROWD_LIMIT = 20;
const CHIP_CROWD_KEEP = 10;

/** One count chip: the element, the ground point it sits on and the comments it counts. */
export interface CommentChipSpot {
  readonly elementId: string;
  readonly point: PlanePoint;
  readonly elevationM: number;
  readonly count: number;
}

/** Where the camera is, the way it faces and the ground point it orbits. */
export interface ChipView {
  readonly focus: PlanePoint;
  readonly camera: Vector3;
  readonly forward: Vector3;
}

/** A chip for each element with comments, at the element's anchor; gone elements drop out. */
export function commentChipSpots(
  design: DesignDocument,
  counts: ReadonlyMap<string, number>,
  elevationAt: (point: PlanePoint) => number,
): CommentChipSpot[] {
  return [...counts.entries()].flatMap(([elementId, count]) => {
    if (count <= 0) return [];
    const point = anchorPoint(design, { elementId });
    return point === undefined ? [] : [{ elementId, point, elevationM: elevationAt(point), count }];
  });
}

function inFront(spot: CommentChipSpot, view: ChipView): boolean {
  const dx = spot.point.x - view.camera.x;
  const dy = spot.elevationM - view.camera.y;
  const dz = spot.point.y - view.camera.z;
  return dx * view.forward.x + dy * view.forward.y + dz * view.forward.z > 0;
}

function nearFocus(spot: CommentChipSpot, view: ChipView): boolean {
  const distance = Math.hypot(spot.point.x - view.focus.x, spot.point.y - view.focus.y);
  return distance <= COMMENT_CHIP_MAX_DISTANCE_M;
}

/**
 * The chips to draw from this view: in front of the camera and within the distance cap of the
 * point it looks at. When more than 20 pass, the 10 with the most comments stay, in input order.
 */
export function visibleChipIds(spots: readonly CommentChipSpot[], view: ChipView): string[] {
  const shown = spots.filter((spot) => inFront(spot, view) && nearFocus(spot, view));
  if (shown.length <= CHIP_CROWD_LIMIT) return shown.map((spot) => spot.elementId);
  const busiest = new Set(
    [...shown]
      .sort((a, b) => b.count - a.count || a.elementId.localeCompare(b.elementId))
      .slice(0, CHIP_CROWD_KEEP)
      .map((spot) => spot.elementId),
  );
  return shown.filter((spot) => busiest.has(spot.elementId)).map((spot) => spot.elementId);
}
