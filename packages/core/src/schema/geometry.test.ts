import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  localPointSchema,
  polygonArea,
  polygonContains,
  polygonSchema,
  polylineSchema,
  ringEdges,
  type LocalPoint,
  type Polygon,
} from './geometry.js';
import { metres } from './units.js';

const point = (x: number, y: number): LocalPoint => ({ x: metres(x), y: metres(y) });
const square: Polygon = [point(0, 0), point(10, 0), point(10, 10), point(0, 10)];
// An L shape: the notch at the top right is outside.
const concave: Polygon = [
  point(0, 0),
  point(10, 0),
  point(10, 4),
  point(4, 4),
  point(4, 10),
  point(0, 10),
];

/** Reference even-odd ray casting, kept separate from the winding-number implementation. */
function rayCastContains(
  polygon: readonly { x: number; y: number }[],
  p: { x: number; y: number },
) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    const crosses =
      a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x;
    if (crosses) inside = !inside;
  }
  return inside;
}

/** Star-shaped polygons around the origin are simple and often concave. */
const starPolygon = fc
  .array(
    fc.record({
      angle: fc.double({ min: 0, max: 1, noNaN: true }),
      radius: fc.double({ min: 1, max: 50, noNaN: true }),
    }),
    { minLength: 3, maxLength: 12 },
  )
  .map((spokes) => {
    const sorted = [...spokes].sort((a, b) => a.angle - b.angle);
    return sorted.map(({ angle, radius }, index) => {
      const theta = ((index + angle) / sorted.length) * 2 * Math.PI;
      return point(radius * Math.cos(theta), radius * Math.sin(theta));
    });
  });

describe('geometry schemas', () => {
  it('parses a point and a polygon', () => {
    expect(localPointSchema.parse({ x: 1, y: 2 })).toEqual({ x: 1, y: 2 });
    expect(polygonSchema.parse(square)).toEqual(square);
  });

  it('rejects a polygon with fewer than 3 points', () => {
    expect(polygonSchema.safeParse([point(0, 0), point(1, 1)]).success).toBe(false);
  });

  it('rejects a polyline with fewer than 2 points', () => {
    expect(polylineSchema.safeParse([point(0, 0)]).success).toBe(false);
    expect(polylineSchema.safeParse([point(0, 0), point(1, 1)]).success).toBe(true);
  });
});

describe('polygonArea', () => {
  it('returns the area for either winding order', () => {
    expect(polygonArea(square)).toBe(100);
    expect(polygonArea([...square].reverse() as Polygon)).toBe(100);
    expect(polygonArea(concave)).toBe(64);
  });
});

describe('polygonContains', () => {
  it('finds points inside and outside a square', () => {
    expect(polygonContains(square, point(5, 5))).toBe(true);
    expect(polygonContains(square, point(11, 5))).toBe(false);
    expect(polygonContains(square, point(5, -1))).toBe(false);
  });

  it('treats the notch of a concave polygon as outside', () => {
    expect(polygonContains(concave, point(2, 8))).toBe(true);
    expect(polygonContains(concave, point(8, 2))).toBe(true);
    expect(polygonContains(concave, point(8, 8))).toBe(false);
  });

  it('agrees with ray casting on random simple polygons', () => {
    fc.assert(
      fc.property(
        starPolygon,
        fc.double({ min: -60, max: 60, noNaN: true }),
        fc.double({ min: -60, max: 60, noNaN: true }),
        (polygon, x, y) => {
          const parsed = polygonSchema.parse(polygon);
          expect(polygonContains(parsed, point(x, y))).toBe(rayCastContains(polygon, { x, y }));
        },
      ),
      { seed: 20260925, numRuns: 500 },
    );
  });
});

describe('polygonContains at vertex height', () => {
  // A diamond whose left and right corners sit at y = 2, level with the test points.
  const diamond: Polygon = [point(2, 0), point(4, 2), point(2, 4), point(0, 2)];

  it('counts the centre, level with two corners, as inside', () => {
    expect(polygonContains(diamond, point(2, 2))).toBe(true);
  });

  it('counts points level with the corners but beyond them as outside', () => {
    expect(polygonContains(diamond, point(-1, 2))).toBe(false);
    expect(polygonContains(diamond, point(5, 2))).toBe(false);
  });

  it('treats an empty ring as containing nothing', () => {
    expect(polygonContains([], point(0, 0))).toBe(false);
    expect(ringEdges([])).toEqual([]);
  });
});
