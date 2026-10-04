import type { CatalogIndex } from '../catalog/catalog.js';
import { measureCanopy } from '../metrics/canopy.js';
import { pathEntryId } from '../metrics/footprints.js';
import { rasterizeRibbon } from '../metrics/raster.js';
import type { Random } from '../ports/random.js';
import type { PathSurface } from '../schema/catalog.js';
import { designDocumentSchema, type DesignDocument, type Zone } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';
import type { ProjectParameters } from '../schema/parameters.js';

import type { FeaturePlan } from './features.js';
import type { Place } from './hints.js';
import { createIdSource } from './ids.js';
import type { CanopyPreference, Character, Intent } from './intent.js';
import { pathCostGrid } from './path-costs.js';
import { planPaths, type PathPlan } from './paths.js';
import { placeFeatures, type PlacementResult } from './placement.js';
import type { Site } from './site.js';
import type { Blockers } from './suitability.js';
import { scatterTrees, type ExistingTree, type TreeScatter, type TreeSpecies } from './trees.js';

/** Features at least this big get a path in the connect-all and minimal styles. */
const PATH_TARGET_MIN_AREA_M2 = 20;
const HALF = 0.5;
const CHARACTER_SURFACES: Readonly<Record<Character, PathSurface>> = {
  natural: 'gravel',
  'open-lawn': 'gravel',
  active: 'asphalt',
};
// Garden cultivars; every other catalog tree is native to B.C.
const NON_NATIVE_TREES: readonly string[] = ['flowering-cherry'];
const FALLBACK_PATH_WIDTH_M = 2;

/** Everything about the site that stays the same between layout attempts. */
export interface LayoutContext {
  readonly site: Site;
  readonly blockers: Blockers;
  readonly score: Float64Array;
  /** 1 where a new footprint may go: in the parcel and clear of every blocker. */
  readonly free: Uint8Array;
  readonly entrances: readonly PlanePoint[];
  readonly places: readonly Place[];
  readonly catalog: CatalogIndex;
  readonly parameters: ProjectParameters;
  readonly intent: Intent;
  /** Baseline elements the layout keeps: every locked one and the unlocked ones left alone. */
  readonly kept: DesignDocument;
  /** The whole baseline, so no new element reuses the id of one the intent removed. */
  readonly baseline: DesignDocument;
  readonly zones: readonly Zone[];
}

export interface Layout {
  readonly document: DesignDocument;
  readonly placement: PlacementResult;
  readonly paths: PathPlan;
  readonly trees: TreeScatter;
  readonly canopyTarget: number;
  readonly canopyBefore: number;
}

/** Canopy percent to aim for: none new, halfway to the goal, or the goal itself. */
export function canopyTarget(preference: CanopyPreference, current: number, goal: number): number {
  switch (preference) {
    case 'keep-existing':
      return current;
    case 'add-some':
      return current + Math.max(0, goal - current) * HALF;
    case 'maximize':
      return Math.max(goal, current);
  }
}

function treeSpecies(context: LayoutContext): TreeSpecies[] {
  const natural = context.intent.character === 'natural';
  return [...context.catalog.values()].flatMap((entry) => {
    const radiusM = entry.crownRadiusMatureM;
    if (radiusM === undefined || (natural && NON_NATIVE_TREES.includes(entry.id))) return [];
    return [{ catalogId: entry.id, radiusM }];
  });
}

function existingTrees(context: LayoutContext): ExistingTree[] {
  return context.kept.items.flatMap((item) => {
    const radiusM = context.catalog.get(item.catalogId)?.crownRadiusMatureM;
    return radiusM === undefined ? [] : [{ position: item.position, radiusM }];
  });
}

function pathSurface(intent: Intent): PathSurface {
  return intent.paths.surface ?? CHARACTER_SURFACES[intent.character];
}

function routePaths(
  context: LayoutContext,
  placement: PlacementResult,
  ids: ReturnType<typeof createIdSource>,
) {
  const { site, blockers, parameters, intent } = context;
  const surface = pathSurface(intent);
  const entry = context.catalog.get(pathEntryId(surface));
  const widthM = entry?.geometryKind === 'linear' ? entry.footprint.widthM : FALLBACK_PATH_WIDTH_M;
  const blocked = site.parcel.cells.map((cell, index) =>
    cell === 0 ||
    blockers.forbidden.cells[index] === 1 ||
    blockers.locked.cells[index] === 1 ||
    blockers.kept.cells[index] === 1 ||
    placement.occupied[index] === 1
      ? 1
      : 0,
  );
  const costs = pathCostGrid({
    site,
    blocked,
    rootZones: blockers.rootZones,
    widthM,
    maxRunning: parameters.slopes.maxRunning,
  });
  const targets = placement.placed.flatMap(({ feature, box, centre }) => {
    const areaM2 = box.columns * box.rows * site.grid.cellM * site.grid.cellM;
    return areaM2 < PATH_TARGET_MIN_AREA_M2 ? [] : [{ label: feature.entry.name, centre, areaM2 }];
  });
  const style = intent.paths.style;
  return planPaths({
    site,
    costs,
    blocked,
    style,
    surface,
    widthM,
    limits: parameters.slopes,
    entrances: context.entrances,
    targets,
    ids,
  });
}

function treeFree(context: LayoutContext, placement: PlacementResult, paths: PathPlan): Uint8Array {
  const { grid } = context.site;
  const free = Uint8Array.from(context.free);
  paths.paths.forEach((path) => {
    rasterizeRibbon(grid, path.points, path.widthM).cells.forEach((cell, index) => {
      if (cell === 1) free[index] = 0;
    });
  });
  placement.occupied.forEach((cell, index) => {
    if (cell === 1) free[index] = 0;
  });
  return free;
}

function takenIds(context: LayoutContext): string[] {
  const { items, areas, paths } = context.baseline;
  return [...items, ...areas, ...paths, ...context.zones].map((element) => element.id);
}

/** Places features, routes paths and scatters trees for one feature plan. Never grades terrain. */
export function buildLayout(context: LayoutContext, plan: FeaturePlan, random: Random): Layout {
  const { site, catalog, kept } = context;
  const ids = createIdSource(takenIds(context));
  const placement = placeFeatures({ ...context, features: plan.features, random, ids });
  const paths = routePaths(context, placement, ids);
  const canopyBefore = measureCanopy({
    document: kept,
    catalog,
    grid: site.grid,
    parcel: site.parcel,
  }).percent;
  const target = canopyTarget(
    context.intent.canopy,
    canopyBefore,
    context.parameters.canopy.minPercent,
  );
  const trees = scatterTrees({
    site,
    free: treeFree(context, placement, paths),
    existing: existingTrees(context),
    species: treeSpecies(context),
    requested: plan.trees,
    targetPercent: target,
    random,
    ids,
  });
  const document = designDocumentSchema.parse({
    version: 1,
    items: [...kept.items, ...placement.items, ...trees.items],
    paths: [...kept.paths, ...paths.paths],
    areas: [...kept.areas, ...placement.areas],
    gradeDelta: { cells: [] },
    zones: context.zones,
  });
  return { document, placement, paths, trees, canopyTarget: target, canopyBefore };
}
