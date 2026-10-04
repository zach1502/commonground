import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../adapters/seeded-random.js';
import { rectangleParcel } from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap } from '../metrics/heightmap.js';

import { findPath, type CostGrid } from './astar.js';
import { createIdSource } from './ids.js';
import { buildSite } from './site.js';
import { minimumSpacing, scatterTrees } from './trees.js';

const SIDE = 12;
const STEEP = 1000;
const cellKind = fc.constantFrom('flat', 'flat', 'flat', 'steep', 'blocked');

function costGrid(kinds: readonly string[]): CostGrid {
  const cost = Float64Array.from(kinds, (kind) => {
    if (kind === 'blocked') return Infinity;
    return kind === 'steep' ? STEEP : 1;
  });
  return { width: SIDE, height: SIDE, cellM: 1, cost };
}

/** Whether the goal is reachable over cells passing the test, 8-connected with no corner cuts. */
function reachable(
  grid: CostGrid,
  start: number,
  goal: number,
  allowed: (index: number) => boolean,
) {
  const flatOnly: CostGrid = {
    ...grid,
    cost: grid.cost.map((cost, index) => (allowed(index) ? cost : Infinity)),
  };
  return findPath(flatOnly, start, goal) !== undefined;
}

describe('findPath properties', () => {
  it('never crosses a blocked cell and avoids steep cells when a flat route exists', () => {
    fc.assert(
      fc.property(
        fc.array(cellKind, { minLength: SIDE * SIDE, maxLength: SIDE * SIDE }),
        (kinds) => {
          const grid = costGrid(kinds);
          const start = 0;
          const goal = SIDE * SIDE - 1;
          grid.cost[start] = 1;
          grid.cost[goal] = 1;
          const path = findPath(grid, start, goal);
          if (path === undefined) return;
          expect(path.every((index) => grid.cost[index] !== Infinity)).toBe(true);
          if (reachable(grid, start, goal, (index) => grid.cost[index] === 1)) {
            expect(path.every((index) => grid.cost[index] === 1)).toBe(true);
          }
        },
      ),
      { seed: 20260925, numRuns: 150 },
    );
  });
});

describe('scatterTrees properties', () => {
  it('keeps every pair of trees at least the crown spacing apart', () => {
    const site = buildSite(rectangleParcel(30, 30), makeFlatHeightmap({ width: 30, height: 30 }));
    const species = fc.uniqueArray(
      fc.record({
        catalogId: fc.constantFrom('red-alder', 'garry-oak', 'vine-maple'),
        radiusM: fc.double({ min: 1, max: 6, noNaN: true }),
      }),
      { minLength: 1, maxLength: 3, selector: (entry) => entry.catalogId },
    );
    fc.assert(
      fc.property(species, fc.integer({ min: 0, max: 60 }), fc.nat(), (pool, target, seed) => {
        const result = scatterTrees({
          site,
          free: Uint8Array.from(site.parcel.cells),
          existing: [],
          species: pool,
          requested: [],
          targetPercent: target,
          random: createSeededRandom(seed),
          ids: createIdSource([]),
        });
        const radius = (catalogId: string) =>
          pool.find((entry) => entry.catalogId === catalogId)?.radiusM ?? 0;
        const trees = result.items.map((item) => ({ item, radiusM: radius(item.catalogId) }));
        trees.forEach((a, i) => {
          trees.slice(i + 1).forEach((b) => {
            const distance = Math.hypot(
              a.item.position.x - b.item.position.x,
              a.item.position.y - b.item.position.y,
            );
            expect(distance + 1e-9).toBeGreaterThanOrEqual(minimumSpacing(a.radiusM, b.radiusM));
          });
        });
      }),
      { seed: 20260925, numRuns: 40 },
    );
  });
});
