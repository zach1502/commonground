import { describe, expect, it } from 'vitest';

import { catalogIndex, catalogItems } from '../catalog/catalog.js';
import {
  itemAt,
  rectangle,
  type AreaInput,
  type ItemInput,
  type PathInput,
} from '../metrics/fixtures/design-builders.js';
import type { Grid } from '../metrics/raster.js';
import type { CatalogItem } from '../schema/catalog.js';

import { syntheticDesign, TEN_BY_TEN } from './fixtures.js';
import {
  buildHeatmaps,
  centrelineMask,
  HEATMAP_CATEGORIES,
  HEATMAP_GROUPS,
  HEATMAP_LAYERS,
  heatAt,
  roundedValues,
} from './heatmaps.js';

const straightPath: PathInput = {
  id: 'p1',
  surface: 'gravel',
  widthM: 1,
  points: [
    { x: 0.5, y: 4.5 },
    { x: 9.5, y: 4.5 },
  ],
};

const designs = [
  syntheticDesign({
    id: 'a',
    parts: {
      items: [itemAt('t1', 'garry-oak', 2.5, 2.5)],
      paths: [straightPath],
      cells: [{ x: 0, y: 0, deltaM: 0.5 }],
    },
  }),
  syntheticDesign({
    id: 'b',
    parts: {
      items: [itemAt('t1', 'garry-oak', 2.5, 2.5), itemAt('t2', 'garry-oak', 2.6, 2.6)],
      areas: [
        { id: 'd1', catalogId: 'off-leash-area', polygon: rectangle(6, 6, 8, 8), locked: false },
      ],
      cells: [
        { x: 0, y: 0, deltaM: -0.2 },
        { x: 1, y: 0, deltaM: 0 },
      ],
    },
  }),
  syntheticDesign({
    id: 'c',
    parts: { items: [{ ...itemAt('old', 'garry-oak', 7.5, 7.5), locked: true }] },
  }),
];

// Built inside each test, so a heatmap bug that throws fails that test instead of the whole file.
const buildMaps = () => buildHeatmaps({ designs, catalog: catalogIndex, grid: TEN_BY_TEN });
const layer = (category: string) => {
  const found = buildMaps().find((map) => map.category === category);
  if (found === undefined) throw new Error(`No ${category} heatmap`);
  return found;
};

describe('buildHeatmaps', () => {
  it('counts each design once per cell and divides by the design count', () => {
    // Both a and b put a tree over cell (2, 2); b's two trees still count once.
    expect(heatAt(layer('tree'), 2, 2)).toBeCloseTo(2 / 3);
    expect(Math.max(...layer('tree').values)).toBeCloseTo(2 / 3);
  });

  it('leaves locked elements out of placement heatmaps', () => {
    expect(heatAt(layer('tree'), 7, 7)).toBe(0);
  });

  it('marks area placements by the cells they cover', () => {
    expect(heatAt(layer('dog'), 6, 6)).toBeCloseTo(1 / 3);
    expect(heatAt(layer('dog'), 8, 8)).toBe(0);
  });

  it('counts regraded cells where the delta is not zero', () => {
    expect(heatAt(layer('regrade'), 0, 0)).toBeCloseTo(2 / 3);
    expect(heatAt(layer('regrade'), 1, 0)).toBe(0);
  });

  it('draws desire lines as a 2 m band along path centrelines, so nearby lines sum', () => {
    const lines = layer('desireLines');
    for (const j of [3, 4, 5]) {
      const row = Array.from({ length: 10 }, (_, i) => heatAt(lines, i, j));
      expect(row.every((value) => Math.abs(value - 1 / 3) < 1e-6)).toBe(true);
    }
    expect(heatAt(lines, 0, 2) + heatAt(lines, 0, 6)).toBe(0);
  });

  it('keeps every value between 0 and 1', () => {
    buildMaps().forEach((map) => {
      expect(map.values.every((value) => value >= 0 && value <= 1)).toBe(true);
    });
  });

  it('returns all-zero grids when there are no designs', () => {
    const empty = buildHeatmaps({ designs: [], catalog: catalogIndex, grid: TEN_BY_TEN });
    expect(empty.every((map) => map.values.every((value) => value === 0))).toBe(true);
    expect(empty.map((map) => map.category)).toEqual([...HEATMAP_LAYERS]);
    expect(HEATMAP_LAYERS.slice(-2)).toEqual(['regrade', 'desireLines']);
  });
});

// Each catalog category gets its own 10 m column on a 160 by 20 m grid, so no two overlap.
const WIDE: Grid = { width: 160, height: 20, cellM: 1, originLocal: { x: 0, y: 0 } };
const COLUMN_M = 10;
const HALF_SIDE_M = 3;

function firstOfEachCategory(): CatalogItem[] {
  const seen = new Map<string, CatalogItem>();
  catalogItems.forEach((item) => {
    if (!seen.has(item.category)) seen.set(item.category, item);
  });
  return [...seen.values()];
}

interface PlacedParts {
  items: ItemInput[];
  paths: PathInput[];
  areas: AreaInput[];
}

function placeEach(entries: readonly CatalogItem[]): PlacedParts {
  const parts: PlacedParts = { items: [], paths: [], areas: [] };
  entries.forEach((entry, index) => {
    const x = index * COLUMN_M + COLUMN_M / 2;
    const id = `e${String(index)}`;
    if (entry.geometryKind === 'point') parts.items.push(itemAt(id, entry.id, x, COLUMN_M));
    if (entry.geometryKind === 'area') {
      const polygon = rectangle(x - HALF_SIDE_M, 2, x + HALF_SIDE_M, 2 + 2 * HALF_SIDE_M);
      parts.areas.push({ id, catalogId: entry.id, polygon, locked: false });
    }
    if (entry.geometryKind === 'linear') {
      const surface = entry.id.replace('path-', '') as PathInput['surface'];
      parts.paths.push({
        id,
        surface,
        widthM: 2,
        points: [
          { x, y: 2 },
          { x, y: 18 },
        ],
      });
    }
  });
  return parts;
}

describe('heatmap categories', () => {
  it('has a heatmap for every category in the catalog', () => {
    const categories: readonly string[] = HEATMAP_CATEGORIES;
    catalogItems.forEach((item) => {
      expect(categories, item.id).toContain(item.category);
    });
  });

  it('puts heat in every layer for a design with one element per category', () => {
    const entries = firstOfEachCategory();
    const design = syntheticDesign({
      id: 'all',
      parts: { ...placeEach(entries), cells: [{ x: 1, y: 1, deltaM: 0.3 }] },
    });
    const all = buildHeatmaps({ designs: [design], catalog: catalogIndex, grid: WIDE });
    expect(entries.length).toBe(HEATMAP_CATEGORIES.length);
    all.forEach((map) => {
      expect(Math.max(...map.values), map.category).toBe(1);
    });
  });

  it('groups paths and grading apart from the placed features, each layer once', () => {
    expect(HEATMAP_GROUPS.map((group) => group.id)).toEqual(['pathsAndGrading', 'features']);
    expect(HEATMAP_GROUPS[0]?.layers).toEqual(['path', 'desireLines', 'regrade']);
    const grouped = HEATMAP_GROUPS.flatMap((group) => group.layers);
    expect([...grouped].sort()).toEqual([...HEATMAP_LAYERS].sort());
  });
});

describe('centrelineMask', () => {
  it('marks a diagonal without gaps and ignores points off the grid', () => {
    const mask = centrelineMask(TEN_BY_TEN, [
      { x: 0.5, y: 0.5 },
      { x: 3.5, y: 3.5 },
      { x: 20, y: 20 },
    ]);
    [0, 1, 2, 3].forEach((i) => {
      expect(mask.cells[i * 10 + i]).toBe(1);
    });
  });
});

describe('roundedValues', () => {
  it('rounds values to three decimals for the wire', () => {
    expect(roundedValues(Float32Array.from([1 / 3, 0, 1]))).toEqual([0.333, 0, 1]);
  });
});

describe('centrelineMask cells', () => {
  const marked = (grid: Grid, points: readonly { x: number; y: number }[]) =>
    [...centrelineMask(grid, points).cells.entries()]
      .filter(([, cell]) => cell === 1)
      .map(([index]) => index);

  it('marks one full row for a line that runs past both side edges, and no other row', () => {
    const cells = marked(TEN_BY_TEN, [
      { x: -3, y: 5.5 },
      { x: 13, y: 5.5 },
    ]);
    expect(cells).toEqual([50, 51, 52, 53, 54, 55, 56, 57, 58, 59]);
  });

  it('samples along a line that starts west of the grid, as far as it goes', () => {
    const across = marked(TEN_BY_TEN, [
      { x: -3, y: 5.5 },
      { x: 3, y: 5.5 },
    ]);
    expect(across).toEqual([50, 51, 52, 53]);
    const up = marked(TEN_BY_TEN, [
      { x: 5.5, y: -3 },
      { x: 5.5, y: 3 },
    ]);
    expect(up).toEqual([5, 15, 25, 35]);
  });

  it('marks the cell the line ends in', () => {
    // 2.6 m at 2 samples per metre: the last sample is the end point, just inside cell 3.
    const cells = marked(TEN_BY_TEN, [
      { x: 0.5, y: 5.5 },
      { x: 3.1, y: 5.5 },
    ]);
    expect(cells).toEqual([50, 51, 52, 53]);
  });

  it('uses the grid origin and cell size', () => {
    const coarse: Grid = { width: 5, height: 5, cellM: 2, originLocal: { x: 100, y: 100 } };
    const cells = marked(coarse, [
      { x: 100.5, y: 101 },
      { x: 109.5, y: 101 },
    ]);
    expect(cells).toEqual([0, 1, 2, 3, 4]);
  });
});

describe('regrade heatmap cells', () => {
  const regradeOf = (cells: readonly { x: number; y: number; deltaM: number }[]) => {
    const graded = syntheticDesign({ id: 'r', parts: { cells } });
    const maps = buildHeatmaps({ designs: [graded], catalog: catalogIndex, grid: TEN_BY_TEN });
    const regrade = maps.find((map) => map.category === 'regrade');
    return [...(regrade?.values ?? [])].flatMap((value, index) => (value > 0 ? [index] : []));
  };

  it('puts a regraded cell at row times width plus column', () => {
    expect(regradeOf([{ x: 3, y: 2, deltaM: 0.5 }])).toEqual([23]);
  });

  it('ignores a regraded cell one column east of the grid', () => {
    expect(regradeOf([{ x: 10, y: 2, deltaM: 0.5 }])).toEqual([]);
  });
});
