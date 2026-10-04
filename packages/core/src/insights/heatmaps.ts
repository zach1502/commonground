import type { CatalogIndex } from '../catalog/catalog.js';
import { designFootprints } from '../metrics/footprints.js';
import { emptyMask, rasterizeRibbon, union, type Grid, type Mask } from '../metrics/raster.js';
import type { Category } from '../schema/catalog.js';
import type { DesignDocument } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';

import type { InsightDesign } from './types.js';

/**
 * Every catalog category, each with a placement heatmap. The first six are the ones the plan
 * names; the rest follow in catalog order.
 */
export const HEATMAP_CATEGORIES = [
  'path',
  'tree',
  'seating',
  'play',
  'garden',
  'dog',
  'shrub',
  'water',
  'sports',
  'lighting',
  'washroom',
  'parking',
  'ground',
  'plaza',
  'amenity',
] as const satisfies readonly Category[];
export type HeatmapCategory = (typeof HEATMAP_CATEGORIES)[number];
export const HEATMAP_LAYERS = [...HEATMAP_CATEGORIES, 'regrade', 'desireLines'] as const;
export type HeatmapLayer = (typeof HEATMAP_LAYERS)[number];

export type HeatmapGroupId = 'pathsAndGrading' | 'features';

export interface HeatmapGroup {
  readonly id: HeatmapGroupId;
  readonly layers: readonly HeatmapLayer[];
}

const PATH_AND_GRADING_LAYERS = ['path', 'desireLines', 'regrade'] as const;

/** The layers as the insights page groups them: where people walk and regrade, then features. */
export const HEATMAP_GROUPS: readonly HeatmapGroup[] = [
  { id: 'pathsAndGrading', layers: PATH_AND_GRADING_LAYERS },
  {
    id: 'features',
    layers: HEATMAP_CATEGORIES.filter(
      (category) => !(PATH_AND_GRADING_LAYERS as readonly string[]).includes(category),
    ),
  },
];

/** Share of designs (0 to 1) that cover each cell, row by row from the south-west. */
export interface Heatmap {
  readonly category: HeatmapLayer;
  readonly grid: Grid;
  readonly values: Float32Array;
}

export interface HeatmapInput {
  readonly designs: readonly InsightDesign[];
  readonly catalog: CatalogIndex;
  readonly grid: Grid;
}

// Two samples per cell along a centreline, so a diagonal never skips a cell.
const SAMPLES_PER_CELL = 2;
const WIRE_DECIMALS = 1000;
// Desire lines are a 2 m band, so paths a metre apart in two designs add up in one cell.
const DESIRE_LINE_WIDTH_M = 2;

function cellIndex(grid: Grid, point: PlanePoint): number | undefined {
  const i = Math.floor((point.x - grid.originLocal.x) / grid.cellM);
  const j = Math.floor((point.y - grid.originLocal.y) / grid.cellM);
  const inside = i >= 0 && j >= 0 && i < grid.width && j < grid.height;
  return inside ? j * grid.width + i : undefined;
}

/** Cells under a polyline's centreline, one cell wide. */
export function centrelineMask(grid: Grid, points: readonly PlanePoint[]): Mask {
  const mask = emptyMask(grid);
  points.slice(1).forEach((to, index) => {
    const from = points[index] ?? to;
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil((length / grid.cellM) * SAMPLES_PER_CELL));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      const cell = cellIndex(grid, {
        x: from.x + t * (to.x - from.x),
        y: from.y + t * (to.y - from.y),
      });
      if (cell !== undefined) mask.cells[cell] = 1;
    }
  });
  return mask;
}

function regradeMask(grid: Grid, document: DesignDocument): Mask {
  const mask = emptyMask(grid);
  document.gradeDelta.cells.forEach(({ x, y, deltaM }) => {
    if (deltaM !== 0 && x < grid.width && y < grid.height) mask.cells[y * grid.width + x] = 1;
  });
  return mask;
}

/** One mask per layer for one design; each design covers a cell at most once per layer. */
function designMasks(design: InsightDesign, input: HeatmapInput): Map<HeatmapLayer, Mask> {
  const { grid, catalog } = input;
  const placed = designFootprints({ document: design.document, catalog, grid }).filter(
    (footprint) => !footprint.locked,
  );
  const masks = new Map<HeatmapLayer, Mask>();
  HEATMAP_CATEGORIES.forEach((category) => {
    const matching = placed.filter((footprint) => footprint.entry.category === category);
    masks.set(
      category,
      union(
        grid,
        matching.map(({ mask }) => mask),
      ),
    );
  });
  masks.set('regrade', regradeMask(grid, design.document));
  const lines = design.document.paths.flatMap((path) => [
    centrelineMask(grid, path.points),
    rasterizeRibbon(grid, path.points, DESIRE_LINE_WIDTH_M),
  ]);
  masks.set('desireLines', union(grid, lines));
  return masks;
}

/** Placement, regrade and desire-line heatmaps summed over designs and divided by their count. */
export function buildHeatmaps(input: HeatmapInput): Heatmap[] {
  const { grid, designs } = input;
  const sums = new Map<HeatmapLayer, Float32Array>(
    HEATMAP_LAYERS.map((layer) => [layer, new Float32Array(grid.width * grid.height)]),
  );
  designs.forEach((design) => {
    designMasks(design, input).forEach((mask, layer) => {
      const sum = sums.get(layer);
      mask.cells.forEach((cell, index) => {
        if (cell === 1 && sum !== undefined) sum[index] = (sum[index] ?? 0) + 1;
      });
    });
  });
  return HEATMAP_LAYERS.map((category) => {
    const values = sums.get(category) ?? new Float32Array(grid.width * grid.height);
    if (designs.length > 0)
      values.forEach((value, index) => (values[index] = value / designs.length));
    return { category, grid, values };
  });
}

export function heatAt(heatmap: Heatmap, i: number, j: number): number {
  return heatmap.values[j * heatmap.grid.width + i] ?? 0;
}

/** Values rounded to three decimals, so the JSON body stays small. */
export function roundedValues(values: Float32Array): number[] {
  return Array.from(values, (value) => Math.round(value * WIRE_DECIMALS) / WIRE_DECIMALS);
}
