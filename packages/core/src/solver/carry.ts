import type { CatalogIndex } from '../catalog/catalog.js';
import type { DesignArea, DesignDocument } from '../schema/design.js';
import { polygonArea, type PlanePoint } from '../schema/geometry.js';

import { entryFor, SIZE_FACTORS, type PlannedFeature, type Replacement } from './features.js';
import type { Intent, IntentFeature } from './intent.js';

/** The baseline a layout starts from, and what is left of the intent once it is counted. */
export interface Carry {
  /** Locked elements, plus unlocked ones the intent leaves where they are. */
  readonly kept: DesignDocument;
  /** The intent with existing areas counted toward its features. */
  readonly intent: Intent;
  /** Existing areas the intent moves or resizes, placed before new features. */
  readonly reworks: readonly PlannedFeature[];
}

interface CarryState {
  readonly catalog: CatalogIndex;
  /** Unlocked baseline areas no intent feature has claimed yet. */
  readonly pool: DesignArea[];
  readonly removed: Set<string>;
  readonly reworks: PlannedFeature[];
}

type Change = Replacement['change'] | 'keep';

function matcherFor(feature: IntentFeature, catalog: CatalogIndex) {
  return (catalogId: string): boolean =>
    feature.catalogId === undefined
      ? catalog.get(catalogId)?.category === feature.category
      : catalogId === feature.catalogId;
}

/** A size asks for a resize, a placement alone asks for a move, and neither keeps it as it is. */
function changeOf(feature: IntentFeature): Change {
  if (feature.size === 'small' || feature.size === 'large') return 'resize';
  return Object.keys(feature.placement ?? {}).length > 0 ? 'move' : 'keep';
}

function boundsOf(points: readonly PlanePoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return { widthM: Math.max(...xs) - Math.min(...xs), depthM: Math.max(...ys) - Math.min(...ys) };
}

/**
 * A box with the area's proportions: the same area for a move, scaled by the size factor for a
 * resize, and never under the catalog minimum.
 */
function boxFor(area: DesignArea, feature: IntentFeature, minAreaM2: number) {
  const { widthM, depthM } = boundsOf(area.polygon);
  const factor = SIZE_FACTORS[feature.size ?? 'medium'];
  const target = Math.max(minAreaM2, polygonArea(area.polygon) * factor);
  const scale = Math.sqrt(target / (widthM * depthM));
  return { kind: 'box', widthM: widthM * scale, depthM: depthM * scale } as const;
}

function rework(state: CarryState, area: DesignArea, feature: IntentFeature, change: Change) {
  const entry = state.catalog.get(area.catalogId);
  if (change === 'keep' || entry?.geometryKind !== 'area') return;
  state.removed.add(area.id);
  state.reworks.push({
    entry,
    sizing: boxFor(area, feature, entry.footprint.minAreaM2),
    placement: feature.placement,
    origin: 'baseline',
    replaces: { area, change },
  });
}

function takeAreas(state: CarryState, matches: (id: string) => boolean, count: number) {
  const taken = state.pool.filter((area) => matches(area.catalogId)).slice(0, count);
  taken.forEach((area) => state.pool.splice(state.pool.indexOf(area), 1));
  return taken;
}

function removeAll(state: CarryState, baseline: DesignDocument, matches: (id: string) => boolean) {
  [...baseline.items, ...baseline.areas]
    .filter((element) => !element.locked && matches(element.catalogId))
    .forEach((element) => state.removed.add(element.id));
}

/** What is left of one intent feature after the baseline is counted toward it. */
function carryFeature(state: CarryState, baseline: DesignDocument, feature: IntentFeature) {
  const matches = matcherFor(feature, state.catalog);
  if (feature.count === 0) {
    removeAll(state, baseline, matches);
    return [];
  }
  if (entryFor(state.catalog, feature)?.geometryKind !== 'area') return [feature];
  const taken = takeAreas(state, matches, feature.count);
  taken.forEach((area) => {
    rework(state, area, feature, changeOf(feature));
  });
  const left = feature.count - taken.length;
  return left > 0 ? [{ ...feature, count: left }] : [];
}

/**
 * Starts a layout from the park as it is. Locked elements always stay. Unlocked ones stay as
 * they are unless the intent asks otherwise: a count of 0 removes them, and a placement or a
 * small or large size moves or resizes an existing area. Existing areas count toward the
 * number of areas the intent asks for; items and trees the intent names are added.
 */
export function carryBaseline(
  intent: Intent,
  baseline: DesignDocument,
  catalog: CatalogIndex,
): Carry {
  const state: CarryState = {
    catalog,
    pool: baseline.areas.filter((area) => !area.locked),
    removed: new Set(),
    reworks: [],
  };
  const features = intent.features.flatMap((feature) => carryFeature(state, baseline, feature));
  const stays = (element: { readonly id: string }) => !state.removed.has(element.id);
  return {
    kept: {
      ...baseline,
      items: baseline.items.filter(stays),
      areas: baseline.areas.filter(stays),
    },
    intent: { ...intent, features },
    reworks: state.reworks,
  };
}
