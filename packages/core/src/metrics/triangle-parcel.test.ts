import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import { polygonArea, polygonSchema } from '../schema/geometry.js';
import { parcelSchema } from '../schema/parcel.js';

import { measureCanopy } from './canopy.js';
import { designOf, itemAt } from './fixtures/design-builders.js';
import { makeFlatHeightmap } from './heightmap.js';
import { parcelGrid } from './parcel-grid.js';
import { areaM2, gridOf, rasterizePolygon } from './raster.js';

// A right triangle that covers half of its 120 by 80 m box.
const triangle = polygonSchema.parse([
  { x: 0, y: 0 },
  { x: 120, y: 0 },
  { x: 0, y: 80 },
]);
const grid = gridOf(
  makeFlatHeightmap(
    parcelGrid(
      parcelSchema.parse({
        id: 'triangle',
        name: 'Triangle',
        polygon: triangle,
        origin: { lat: 49, lon: -123 },
      }),
    ),
  ),
);
const parcel = rasterizePolygon(grid, triangle);

describe('metrics on a triangular parcel', () => {
  it('measures the parcel as the triangle within 1 percent, not as its box', () => {
    const area = polygonArea(triangle);
    expect(area).toBe(4800);
    expect(Math.abs(areaM2(parcel) - area) / area).toBeLessThan(0.01);
  });

  it('gives canopy share over the triangle area', () => {
    const canopy = measureCanopy({
      document: designOf({ items: [itemAt('t1', 'red-alder', 30, 20)] }),
      catalog: catalogIndex,
      grid,
      parcel,
    });
    const share = (canopy.areaM2 / polygonArea(triangle)) * 100;
    expect(Math.abs(canopy.percent - share) / share).toBeLessThan(0.01);
    // Over the 9600 m2 box the same crown would read about half as much.
    expect(canopy.percent).toBeGreaterThan((canopy.areaM2 / 9600) * 100 * 1.9);
  });
});
