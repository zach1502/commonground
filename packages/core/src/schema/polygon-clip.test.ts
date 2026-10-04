import { describe, expect, it } from 'vitest';

import { polygonContains, type PlanePoint } from './geometry.js';
import { clipPolygonToBox, ringArea } from './polygon-clip.js';

const TRIANGLE: PlanePoint[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 0, y: 10 },
];
// An L: a 10 by 10 square with its north-east 5 by 5 quarter cut out.
const L_SHAPE: PlanePoint[] = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 5 },
  { x: 5, y: 5 },
  { x: 5, y: 10 },
  { x: 0, y: 10 },
];
const RECTANGLE: PlanePoint[] = [
  { x: 0, y: 0 },
  { x: 20, y: 0 },
  { x: 20, y: 8 },
  { x: 0, y: 8 },
];

describe('polygonContains on the test shapes', () => {
  it('keeps a triangle to its hypotenuse', () => {
    expect(polygonContains(TRIANGLE, { x: 2, y: 2 })).toBe(true);
    expect(polygonContains(TRIANGLE, { x: 6, y: 6 })).toBe(false);
  });

  it('leaves the cut quarter of an L outside', () => {
    expect(polygonContains(L_SHAPE, { x: 2, y: 8 })).toBe(true);
    expect(polygonContains(L_SHAPE, { x: 8, y: 2 })).toBe(true);
    expect(polygonContains(L_SHAPE, { x: 8, y: 8 })).toBe(false);
  });

  it('covers a rectangle and nothing past it', () => {
    expect(polygonContains(RECTANGLE, { x: 19, y: 7 })).toBe(true);
    expect(polygonContains(RECTANGLE, { x: 21, y: 4 })).toBe(false);
  });
});

describe('clipPolygonToBox', () => {
  it('returns a box that sits wholly inside the shape as the box', () => {
    const clipped = clipPolygonToBox(RECTANGLE, { minX: 2, minY: 2, maxX: 3, maxY: 3 });
    expect(ringArea(clipped)).toBeCloseTo(1, 9);
  });

  it('returns nothing for a box wholly outside the shape', () => {
    expect(clipPolygonToBox(TRIANGLE, { minX: 8, minY: 8, maxX: 9, maxY: 9 })).toEqual([]);
  });

  it('cuts a cell that the hypotenuse crosses along the hypotenuse', () => {
    // The line x + y = 10 halves the cell from (4, 5) to (5, 6) corner to corner.
    const half = clipPolygonToBox(TRIANGLE, { minX: 4, minY: 5, maxX: 5, maxY: 6 });
    expect(ringArea(half)).toBeCloseTo(0.5, 9);
    half.forEach((corner) => {
      expect(corner.x + corner.y).toBeLessThanOrEqual(10 + 1e-9);
    });
    // The next cell up the line only touches the triangle at one corner.
    const touching = clipPolygonToBox(TRIANGLE, { minX: 5, minY: 5, maxX: 6, maxY: 6 });
    expect(ringArea(touching)).toBeCloseTo(0, 9);
  });

  it('keeps the inner corner of an L inside a cell around it', () => {
    const clipped = clipPolygonToBox(L_SHAPE, { minX: 4, minY: 4, maxX: 6, maxY: 6 });
    // Three of the four 1 by 1 quarters around (5, 5) are inside the L.
    expect(ringArea(clipped)).toBeCloseTo(3, 9);
    expect(clipped).toContainEqual({ x: 5, y: 5 });
  });

  it('adds up to the area of each shape over a grid of cells', () => {
    [TRIANGLE, L_SHAPE, RECTANGLE].forEach((shape) => {
      let total = 0;
      for (let y = -1; y < 11; y += 1) {
        for (let x = -1; x < 21; x += 1) {
          total += ringArea(
            clipPolygonToBox(shape, { minX: x, minY: y, maxX: x + 1, maxY: y + 1 }),
          );
        }
      }
      expect(total).toBeCloseTo(ringArea(shape), 6);
    });
  });
});

describe('ringArea', () => {
  it('gives the area of the test shapes whichever way they wind', () => {
    expect(ringArea(TRIANGLE)).toBe(50);
    expect(ringArea([...L_SHAPE].reverse())).toBe(75);
    expect(ringArea(RECTANGLE)).toBe(160);
  });
});
