import { describe, expect, it } from 'vitest';

import { polygonContains } from '../schema/geometry.js';

import { rectangle } from './fixtures/design-builders.js';
import { fitModules } from './modules.js';

const bed = { widthM: 1.2, depthM: 3, aisleM: 0.6 };

describe('fitModules', () => {
  it('fits 12 raised beds in a 12 x 9 m rectangle', () => {
    // Each bed needs an aisle on every side. Along x, 6 beds use 0.6 + 6 * (1.2 + 0.6) = 11.4 m
    // and 7 would need 13.2 m. Along y, 2 beds use 0.6 + 2 * (3 + 0.6) = 7.8 m and 3 need 11.4 m.
    const fit = fitModules(rectangle(0, 0, 12, 9), bed);
    expect(fit.count).toBe(12);
    expect(fit.placements).toHaveLength(12);
    expect(fit.placements[0]).toEqual({ origin: { x: 0.6, y: 0.6 }, widthM: 1.2, depthM: 3 });
  });

  it('places every module inside the polygon', () => {
    const polygon = rectangle(3, 5, 20, 17);
    fitModules(polygon, bed).placements.forEach(({ origin, widthM, depthM }) => {
      expect(polygonContains(polygon, origin)).toBe(true);
      expect(polygonContains(polygon, { x: origin.x + widthM, y: origin.y + depthM })).toBe(true);
    });
  });

  it('skips the notch of an L-shaped area', () => {
    const lShape = [
      { x: 0, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 4.5 },
      { x: 6, y: 4.5 },
      { x: 6, y: 9 },
      { x: 0, y: 9 },
    ] as const;
    // The first row spans y 0 to 4.2 with its aisles and fits 6 beds across 12 m. The second row
    // spans y 3.6 to 7.8, so it only fits in the 6 m wide left arm: 0.6 + 3 * 1.8 = 6.0 m, 3 beds.
    const fit = fitModules([...lShape], bed);
    expect(fit.count).toBe(6 + 3);
  });

  it('rejects beds that a narrow notch cuts through', () => {
    // A 0.2 m wide slot runs from y 0 to 5 at x 1.1 to 1.3, through the first column of beds in
    // both rows. The first bed's corners stay inside the polygon, but the slot's sides cross its edges.
    const slotted = [
      { x: 0, y: 0 },
      { x: 1.1, y: 0 },
      { x: 1.1, y: 5 },
      { x: 1.3, y: 5 },
      { x: 1.3, y: 0 },
      { x: 12, y: 0 },
      { x: 12, y: 9 },
      { x: 0, y: 9 },
    ] as const;
    expect(fitModules([...slotted], bed).count).toBe(12 - 2);
  });

  it('fits nothing in an area smaller than one module with its aisles', () => {
    expect(fitModules(rectangle(0, 0, 2, 4), bed).count).toBe(0);
  });
});
