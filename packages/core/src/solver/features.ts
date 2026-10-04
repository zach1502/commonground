import { modulePlotCount, type CatalogIndex } from '../catalog/catalog.js';
import type { AreaCatalogItem, CatalogItem, Category } from '../schema/catalog.js';
import type { DesignArea } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';

import type { FeatureSize, Intent, IntentPlacement } from './intent.js';

const SIZE_FACTOR_VALUES = { small: 0.6, medium: 1, large: 1.6 } as const;
/** Area multiples for the small, medium and large sizes. */
export const SIZE_FACTORS: Readonly<Record<FeatureSize, number>> = SIZE_FACTOR_VALUES;
/** A garden never grows past this many cells a side while it looks for enough plots. */
const MAX_GROWTH_CELLS = 60;
// Growth alternates between adding a row and adding a column.
const AXES = 2;

export type PlacedEntry = Exclude<CatalogItem, { geometryKind: 'linear' }>;

export type Sizing =
  | { readonly kind: 'preset'; readonly size: FeatureSize }
  | { readonly kind: 'plots'; readonly minPlots: number }
  | { readonly kind: 'box'; readonly widthM: number; readonly depthM: number };

/** An existing area the intent moves or resizes; the new footprint keeps its id. */
export interface Replacement {
  readonly area: DesignArea;
  readonly change: 'move' | 'resize';
}

/** One item or area the solver will try to place. */
export interface PlannedFeature {
  readonly entry: PlacedEntry;
  readonly sizing: Sizing;
  readonly placement?: IntentPlacement | undefined;
  /**
   * 'repair' features were added to meet a hard project rule. 'baseline' features are existing
   * areas the intent moves or resizes.
   */
  readonly origin: 'intent' | 'repair' | 'baseline';
  readonly replaces?: Replacement | undefined;
}

export interface TreeRequest {
  readonly catalogId?: string;
  readonly count: number;
}

export interface FeaturePlan {
  readonly features: readonly PlannedFeature[];
  readonly trees: readonly TreeRequest[];
}

export interface CellSize {
  readonly columns: number;
  readonly rows: number;
}

export interface EntryReference {
  readonly catalogId?: string | undefined;
  readonly category?: Category | undefined;
}

/** The named entry, or the first catalog entry in the category. */
export function entryFor(
  catalog: CatalogIndex,
  reference: EntryReference,
): CatalogItem | undefined {
  if (reference.catalogId !== undefined) return catalog.get(reference.catalogId);
  return [...catalog.values()].find((entry) => entry.category === reference.category);
}

function treeRequest(feature: Intent['features'][number]): TreeRequest {
  const { catalogId, count } = feature;
  return catalogId === undefined ? { count } : { catalogId, count };
}

/** Turns the intent's features into items and areas to place, plus the trees it asked for. */
export function planFeatures(intent: Intent, catalog: CatalogIndex): FeaturePlan {
  const trees: TreeRequest[] = [];
  const features = intent.features.flatMap((feature): PlannedFeature[] => {
    const entry = entryFor(catalog, feature);
    if (entry === undefined || entry.geometryKind === 'linear') return [];
    if (entry.category === 'tree') {
      trees.push(treeRequest(feature));
      return [];
    }
    const planned: PlannedFeature = {
      entry,
      sizing: { kind: 'preset', size: feature.size ?? 'medium' },
      placement: feature.placement,
      origin: 'intent',
    };
    return Array.from({ length: feature.count }, () => planned);
  });
  return { features, trees };
}

function cellsFor(lengthM: number, cellM: number): number {
  return Math.max(1, Math.ceil(lengthM / cellM - Number.EPSILON));
}

function rectangleOf(size: CellSize, cellM: number): PlanePoint[] {
  const width = size.columns * cellM;
  const depth = size.rows * cellM;
  return [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: depth },
    { x: 0, y: depth },
  ];
}

/** Adds a row or a column in turn until the area fits the plots, within the growth limit. */
function growForPlots(
  entry: AreaCatalogItem,
  start: CellSize,
  sizing: { minPlots: number },
  cellM: number,
) {
  let size = start;
  for (let step = 0; step < MAX_GROWTH_CELLS * AXES; step += 1) {
    if (modulePlotCount(entry, rectangleOf(size, cellM)) >= sizing.minPlots) return size;
    size =
      step % AXES === 0 ? { ...size, rows: size.rows + 1 } : { ...size, columns: size.columns + 1 };
  }
  return size;
}

/** How many grid cells a feature covers along x (columns) and y (rows). */
export function footprintCells(entry: PlacedEntry, sizing: Sizing, cellM: number): CellSize {
  if (entry.geometryKind === 'point') {
    const { widthM, depthM } = entry.footprint;
    return { columns: cellsFor(widthM, cellM), rows: cellsFor(depthM, cellM) };
  }
  const { minAreaM2, defaultAreaM2 } = entry.footprint;
  if (sizing.kind === 'box') {
    return { columns: cellsFor(sizing.widthM, cellM), rows: cellsFor(sizing.depthM, cellM) };
  }
  if (sizing.kind === 'plots') {
    // Start from the smallest allowed area, so a garden is only as big as its plots need.
    const side = cellsFor(Math.sqrt(minAreaM2), cellM);
    return growForPlots(entry, { columns: side, rows: side }, sizing, cellM);
  }
  const side = cellsFor(
    Math.sqrt(Math.max(minAreaM2, defaultAreaM2 * SIZE_FACTORS[sizing.size])),
    cellM,
  );
  return { columns: side, rows: side };
}
