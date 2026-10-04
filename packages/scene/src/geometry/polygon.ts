import type { GroundPoint } from '../types.js';

import { itemAt } from './arrays.js';
import { polygonArea } from './measure.js';
import { VECTOR_SIZE } from './vector-layout.js';

type Outline = readonly GroundPoint[];

/** Even-odd test for a point against an outline. */
export function isInsidePolygon(outline: Outline, point: GroundPoint): boolean {
  let inside = false;
  outline.forEach((a, index) => {
    const b = itemAt(outline, index - 1);
    const crosses = a.z > point.z !== b.z > point.z;
    if (crosses && point.x < ((b.x - a.x) * (point.z - a.z)) / (b.z - a.z) + a.x) {
      inside = !inside;
    }
  });
  return inside;
}

function triangleContains(corners: readonly GroundPoint[], point: GroundPoint): boolean {
  return corners.every((from, k) => polygonArea([from, itemAt(corners, k + 1), point]) >= 0);
}

function isEar(outline: Outline, remaining: readonly number[], position: number): boolean {
  const count = remaining.length;
  const corners = [-1, 0, 1].map((step) => itemAt(outline, itemAt(remaining, position + step)));
  if (polygonArea(corners) <= 0) {
    return false;
  }
  return remaining.every((vertex, k) => {
    const neighbour = Math.abs(k - position) <= 1 || Math.abs(k - position) === count - 1;
    return neighbour || !triangleContains(corners, itemAt(outline, vertex));
  });
}

/** Ear-clipping triangulation of a simple outline; triangles wind face-up either way round. */
export function triangulate(outline: Outline): number[] {
  const order = outline.map((_, index) => index);
  const remaining = polygonArea(outline) >= 0 ? order : order.reverse();
  const triangles: number[] = [];
  while (remaining.length >= VECTOR_SIZE) {
    const ear = remaining.findIndex((_, position) => isEar(outline, remaining, position));
    const position = ear === -1 ? 0 : ear;
    triangles.push(
      itemAt(remaining, position - 1),
      itemAt(remaining, position),
      itemAt(remaining, position + 1),
    );
    remaining.splice(position, 1);
  }
  return triangles;
}
