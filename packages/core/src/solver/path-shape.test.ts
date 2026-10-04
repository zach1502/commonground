import { describe, expect, it } from 'vitest';

import { rectangleParcel } from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap } from '../metrics/heightmap.js';
import { emptyMask } from '../metrics/raster.js';
import { measurePathSlopes } from '../metrics/slopes.js';
import { designPathSchema } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';

import { pathCostGrid } from './path-costs.js';
import { shapeRoute, type ShapeInput } from './path-shape.js';
import { buildSite, indexOf, type Site } from './site.js';

const WIDTH_M = 1;
const LIMITS = { maxRunning: 0.05, maxCross: 0.02 };
const pathOf = (points: readonly PlanePoint[]) =>
  designPathSchema.parse({ id: 'walk', surface: 'gravel', widthM: WIDTH_M, points });
const site = buildSite(rectangleParcel(20, 20), makeFlatHeightmap({ width: 20, height: 20 }));

/** Only the route's own cells are open, so a curve that leaves them falls back to the plain line. */
function shapeInput(from: Site, route: readonly number[]): ShapeInput {
  const blocked = from.parcel.cells.map((_, index) => (route.includes(index) ? 0 : 1));
  const costs = pathCostGrid({
    site: from,
    blocked,
    rootZones: emptyMask(from.grid),
    widthM: WIDTH_M,
    maxRunning: 0.05,
  });
  return { site: from, costs, blocked, widthM: WIDTH_M, limits: LIMITS };
}

function repeatedIndices(points: readonly { x: number; y: number }[]): number[] {
  return points.flatMap((point, index) => {
    const before = points[index - 1];
    return before?.x === point.x && before.y === point.y ? [index] : [];
  });
}

describe('shapeRoute', () => {
  // A loop leg that steps out to an entrance and the next leg that steps straight back, as in
  // the seeded loop designs.
  it('returns no repeated points for a route that steps out and straight back', () => {
    const cells: [number, number][] = [
      [15, 8],
      [15, 9],
      [15, 10],
      [16, 10],
      [15, 10],
      [15, 11],
      [15, 12],
    ];
    const route = cells.map(([i, j]) => indexOf(site.grid, i, j));
    const points = shapeRoute(shapeInput(site, route), route);
    expect(points).toBeDefined();
    expect(repeatedIndices(points ?? [])).toEqual([]);
    expect(points).toHaveLength(5);
  });

  it('drops a smoothed curve that cuts a corner onto a side hill', () => {
    // A 4.9% slope rises north to y = 18, level ground above. The route climbs the fall line to
    // row 18 and turns east; the curve through it cuts the corner diagonally across the slope.
    const heightmap = makeFlatHeightmap({ width: 30, height: 30 });
    heightmap.elevations.forEach((_, index) => {
      heightmap.elevations[index] = 0.049 * Math.min(Math.floor(index / 30) + 0.5, 18);
    });
    const hill = buildSite(rectangleParcel(30, 30), heightmap);
    const up = Array.from({ length: 14 }, (_, k) => indexOf(hill.grid, 5, 5 + k));
    const east = Array.from({ length: 18 }, (_, k) => indexOf(hill.grid, 6 + k, 18));
    const route = [...up, ...east];
    const input = { ...shapeInput(hill, route), blocked: new Uint8Array(900) };
    const points = shapeRoute(input, route) ?? [];
    const [slopes] = measurePathSlopes(heightmap, [pathOf(points)], LIMITS);
    expect(slopes?.crossSegments).toEqual([]);
    expect(slopes?.runningSegments).toEqual([]);
  });
});
