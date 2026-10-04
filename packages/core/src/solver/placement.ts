import { SLOPE_TOLERANCE } from '../constants.js';
import { emptyMask } from '../metrics/raster.js';
import type { Random } from '../ports/random.js';
import {
  designAreaSchema,
  designItemSchema,
  type DesignArea,
  type DesignItem,
} from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';

import {
  boxCentre,
  boxCentreCell,
  boxGap,
  boxPolygon,
  grownBox,
  markBox,
  summedArea,
  type CellBox,
} from './cell-box.js';
import { footprintCells, type PlannedFeature, type Replacement } from './features.js';
import {
  hintMet,
  preferenceAt,
  resolveHints,
  type Hint,
  type Place,
  type ResolvedHint,
} from './hints.js';
import type { IdSource } from './ids.js';
import { bestBox } from './placement-search.js';
import { readAt } from './read-at.js';
import { alreadyThere, originalMask, rankingHints } from './rework.js';
import type { Site } from './site.js';

/** Items of one category keep at least this far apart, edge to edge. */
const SAME_CATEGORY_GAP_M = 4;
/** Clear ground left around each placed feature, so paths can pass between them. */
const FEATURE_MARGIN_M = 1;
/** Up to this share of random lift on each candidate, so seeds give different layouts. */
const RANK_JITTER = 0.25;

export interface PlacementInput {
  readonly site: Site;
  /** 1 where a new footprint may go. */
  readonly free: Uint8Array;
  readonly score: Float64Array;
  readonly features: readonly PlannedFeature[];
  /** Places hints can name before any feature is placed: locked elements and entrances. */
  readonly places: readonly Place[];
  readonly random: Random;
  readonly ids: IdSource;
}

export interface PlacedFeature {
  readonly feature: PlannedFeature;
  readonly box: CellBox;
  readonly centre: PlanePoint;
  /** The first hint the chosen spot misses, if any. */
  readonly unmetHint?: Hint | undefined;
  /** Place names in the hints that match nothing on the site. */
  readonly missingPlaces: readonly string[];
}

export interface PlacementResult {
  readonly placed: readonly PlacedFeature[];
  readonly unplaced: readonly PlannedFeature[];
  /** Existing areas the intent asked to move or resize that stayed as they were: no spot fit. */
  readonly stayed: readonly PlannedFeature[];
  readonly items: readonly DesignItem[];
  readonly areas: readonly DesignArea[];
  /** 1 on cells a placed footprint covers. */
  readonly occupied: Uint8Array;
}

interface PlacementState {
  readonly reserved: Uint8Array;
  readonly occupied: Uint8Array;
  readonly places: Place[];
  readonly placed: PlacedFeature[];
  readonly unplaced: PlannedFeature[];
  readonly stayed: PlannedFeature[];
  readonly items: DesignItem[];
  readonly areas: DesignArea[];
}

function cellArea(feature: PlannedFeature, cellM: number): number {
  const { columns, rows } = footprintCells(feature.entry, feature.sizing, cellM);
  return columns * rows;
}

const ORIGIN_ORDER: Readonly<Record<PlannedFeature['origin'], number>> = {
  repair: 0,
  baseline: 1,
  intent: 2,
};

/**
 * Features added for a hard project rule go first, then existing areas being moved or resized,
 * then the rest largest first. The sort is stable, so equal sizes keep the intent's order.
 */
function placementOrder(features: readonly PlannedFeature[], cellM: number): PlannedFeature[] {
  return [...features].sort(
    (a, b) =>
      ORIGIN_ORDER[a.origin] - ORIGIN_ORDER[b.origin] || cellArea(b, cellM) - cellArea(a, cellM),
  );
}

function steepTable(site: Site, maxGrade: number | undefined): Float64Array | undefined {
  if (maxGrade === undefined) return undefined;
  return summedArea(site.grid, (index) =>
    readAt(site.slope, index, 0) > maxGrade + SLOPE_TOLERANCE ? 1 : 0,
  );
}

function findBox(
  input: PlacementInput,
  state: PlacementState,
  feature: PlannedFeature,
  hints: readonly ResolvedHint[],
): CellBox | undefined {
  const { site, score, random } = input;
  const gap = Math.ceil(SAME_CATEGORY_GAP_M / site.grid.cellM);
  const sameCategory = state.placed
    .filter((placed) => placed.feature.entry.category === feature.entry.category)
    .map((placed) => placed.box);
  return bestBox({
    grid: site.grid,
    blocked: summedArea(site.grid, (index) => readAt(state.reserved, index, 1)),
    steep: steepTable(site, feature.entry.maxGrade),
    size: footprintCells(feature.entry, feature.sizing, site.grid.cellM),
    rank: (cell) =>
      readAt(score, cell, 0) * preferenceAt(hints, cell) * (1 + RANK_JITTER * random.next()),
    spaced: (candidate) => sameCategory.every((other) => boxGap(candidate, other) >= gap),
  });
}

function elementFor(input: PlacementInput, feature: PlannedFeature, box: CellBox) {
  const { grid } = input.site;
  const id = feature.replaces?.area.id ?? input.ids.next();
  const catalogId = feature.entry.id;
  if (feature.entry.geometryKind === 'point') {
    const position = boxCentre(grid, box);
    return {
      item: designItemSchema.parse({ id, catalogId, position, rotationDeg: 0, locked: false }),
    };
  }
  return {
    area: designAreaSchema.parse({ id, catalogId, polygon: boxPolygon(grid, box), locked: false }),
  };
}

function labelsOf(feature: PlannedFeature): string[] {
  const { entry } = feature;
  return [entry.name.toLowerCase(), entry.id, entry.category];
}

/** Puts an existing area back where it is, taking its cells as if it were just placed. */
function restore(input: PlacementInput, state: PlacementState, feature: PlannedFeature) {
  const original: Replacement | undefined = feature.replaces;
  if (original === undefined) return;
  const mask = originalMask(input.site, original);
  mask.cells.forEach((cell, index) => {
    if (cell === 1) {
      state.occupied[index] = 1;
      state.reserved[index] = 1;
    }
  });
  state.areas.push(original.area);
  state.places.push({ labels: labelsOf(feature), mask });
}

/** No spot fits: a new feature is left out, and an existing area stays as it was. */
function giveUp(input: PlacementInput, state: PlacementState, feature: PlannedFeature) {
  if (feature.replaces === undefined) {
    state.unplaced.push(feature);
    return;
  }
  restore(input, state, feature);
  state.stayed.push(feature);
}

function placeOne(input: PlacementInput, state: PlacementState, feature: PlannedFeature) {
  const { grid } = input.site;
  const { hints, missing } = resolveHints(input.site, feature.placement, state.places);
  const original = feature.replaces;
  if (original !== undefined && alreadyThere(input.site, original, hints)) {
    restore(input, state, feature);
    return;
  }
  const box = findBox(input, state, feature, rankingHints(input.site, feature, hints));
  if (box === undefined) {
    giveUp(input, state, feature);
    return;
  }
  const element = elementFor(input, feature, box);
  if (element.item !== undefined) state.items.push(element.item);
  if (element.area !== undefined) state.areas.push(element.area);
  markBox(state.occupied, grid, box);
  markBox(state.reserved, grid, grownBox(box, Math.ceil(FEATURE_MARGIN_M / grid.cellM)));
  const mask = emptyMask(grid);
  markBox(mask.cells, grid, box);
  state.places.push({ labels: labelsOf(feature), mask });
  const centreCell = boxCentreCell(grid, box);
  state.placed.push({
    feature,
    box,
    centre: boxCentre(grid, box),
    unmetHint: hints.find((hint) => !hintMet(hint, centreCell))?.hint,
    missingPlaces: missing,
  });
}

/** Greedy placement: each feature, largest first, takes the best spot where it fits. */
export function placeFeatures(input: PlacementInput): PlacementResult {
  const state: PlacementState = {
    reserved: input.free.map((cell) => (cell === 1 ? 0 : 1)),
    occupied: new Uint8Array(input.free.length),
    places: [...input.places],
    placed: [],
    unplaced: [],
    stayed: [],
    items: [],
    areas: [],
  };
  placementOrder(input.features, input.site.grid.cellM).forEach((feature) => {
    placeOne(input, state, feature);
  });
  const { placed, unplaced, stayed, items, areas, occupied } = state;
  return { placed, unplaced, stayed, items, areas, occupied };
}
