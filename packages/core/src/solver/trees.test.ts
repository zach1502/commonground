import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '../adapters/seeded-random.js';
import { rectangleParcel } from '../metrics/fixtures/design-builders.js';
import { makeFlatHeightmap } from '../metrics/heightmap.js';

import { createIdSource } from './ids.js';
import { buildSite, cellAt, indexOf } from './site.js';
import { minimumSpacing, scatterTrees, type TreeScatterInput } from './trees.js';

const site = buildSite(rectangleParcel(40, 40), makeFlatHeightmap({ width: 40, height: 40 }));
const alder = { catalogId: 'red-alder', radiusM: 3 };

function inputFor(patch: Partial<TreeScatterInput> = {}): TreeScatterInput {
  return {
    site,
    free: Uint8Array.from(site.parcel.cells),
    existing: [],
    species: [alder],
    requested: [],
    targetPercent: 20,
    random: createSeededRandom(3),
    ids: createIdSource([]),
    ...patch,
  };
}

function positions(
  result: ReturnType<typeof scatterTrees>,
  extra: { x: number; y: number }[] = [],
) {
  return [...result.items.map((item) => item.position), ...extra];
}

describe('minimumSpacing', () => {
  it('is 0.8 of the two crown radii added', () => {
    expect(minimumSpacing(3, 5)).toBeCloseTo(6.4);
  });
});

describe('scatterTrees', () => {
  it('adds trees until the canopy target is met, spaced by crown radius', () => {
    const result = scatterTrees(inputFor());
    expect(result.canopyPercent).toBeGreaterThanOrEqual(20);
    const points = positions(result);
    points.forEach((a, i) => {
      points.slice(i + 1).forEach((b) => {
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(minimumSpacing(3, 3));
      });
    });
  });

  it('adds nothing when the target is already met and no tree was asked for', () => {
    expect(scatterTrees(inputFor({ targetPercent: 0 })).items).toEqual([]);
  });

  it('plants the species and count asked for even past the target', () => {
    const requested = [{ catalogId: 'garry-oak', count: 2 }];
    const species = [alder, { catalogId: 'garry-oak', radiusM: 7 }];
    const result = scatterTrees(inputFor({ targetPercent: 0, requested, species }));
    expect(result.items.map((item) => item.catalogId)).toEqual(['garry-oak', 'garry-oak']);
  });

  it('puts trunks only on free cells and keeps clear of existing trees', () => {
    const free = new Uint8Array(site.parcel.cells.length);
    for (let j = 0; j < 40; j += 1)
      for (let i = 20; i < 40; i += 1) free[indexOf(site.grid, i, j)] = 1;
    const existing = [{ position: { x: 30, y: 20 }, radiusM: 5 }];
    const result = scatterTrees(inputFor({ free, existing }));
    result.items.forEach((item) => {
      expect(free[cellAt(site.grid, item.position) ?? -1]).toBe(1);
      expect(Math.hypot(item.position.x - 30, item.position.y - 20)).toBeGreaterThanOrEqual(
        minimumSpacing(3, 5),
      );
    });
  });

  it('stops short of the target when there is no room left', () => {
    const free = new Uint8Array(site.parcel.cells.length);
    free[indexOf(site.grid, 5, 5)] = 1;
    const result = scatterTrees(inputFor({ free, targetPercent: 50 }));
    expect(result.items).toHaveLength(1);
    expect(result.canopyPercent).toBeLessThan(50);
  });

  it('gives each tree a whole-degree turn and a size within 10 percent', () => {
    const [tree] = scatterTrees(inputFor()).items;
    expect(Number.isInteger(tree?.rotationDeg)).toBe(true);
    expect(tree?.scaleJitter).toBeGreaterThanOrEqual(0.9);
    expect(tree?.scaleJitter).toBeLessThanOrEqual(1.1);
  });
});
