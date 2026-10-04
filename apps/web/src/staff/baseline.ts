import {
  catalogIndex,
  designDocumentSchema,
  existingFeatureId,
  type DesignDocument,
  type Zone,
} from '@parkshape/core';

import type { ProposedFeature } from '../api/staff-api';

export type LockChoice = 'locked' | 'unlocked';
export type Locks = Readonly<Record<string, LockChoice>>;

// Existing trees whose species the catalog lacks draw as a small flowering tree; metrics use
// the measured trunk diameter, so the canopy estimate still follows the real tree.
const FALLBACK_TREE = 'flowering-cherry';
const OUTLINE_CATALOG: Partial<Record<ProposedFeature['kind'], string>> = {
  garden: 'community-garden',
  sportsField: 'lawn',
};
const BUILDING_CATALOG = 'washroom-building';

export function defaultLocks(features: readonly ProposedFeature[]): Record<string, LockChoice> {
  return Object.fromEntries(
    features.map((feature) => [feature.id, feature.suggestedLocked ? 'locked' : 'unlocked']),
  );
}

/** Trees with a position and outlines the editor can draw; the rest cannot join the baseline. */
export function placeableFeatures(features: readonly ProposedFeature[]): ProposedFeature[] {
  return features.filter((feature) =>
    feature.kind === 'tree' ? feature.position !== null : feature.polygon !== null,
  );
}

function centreOf(points: readonly { readonly x: number; readonly y: number }[]) {
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function treeCatalogId(feature: ProposedFeature): string {
  const known = feature.catalogId === null ? undefined : catalogIndex.get(feature.catalogId);
  return known === undefined ? FALLBACK_TREE : known.id;
}

// Plain records; designDocumentSchema checks them once the whole baseline is built.
interface Parts {
  readonly items: readonly object[];
  readonly areas: readonly object[];
}

/** A garden outline keeps the leased plots its site record gives, as the seeded baseline does. */
function recordedPlotsOf(feature: ProposedFeature): { readonly recordedPlots?: number } {
  return feature.kind === 'garden' && feature.plots !== null
    ? { recordedPlots: feature.plots }
    : {};
}

function addFeature(parts: Parts, feature: ProposedFeature, lock: LockChoice): Parts {
  const id = existingFeatureId(feature.id);
  const locked = lock === 'locked';
  if (feature.kind === 'tree' && feature.position !== null) {
    const dbh = feature.dbhCm === null ? {} : { dbhCm: feature.dbhCm };
    const item = {
      id,
      catalogId: treeCatalogId(feature),
      position: feature.position,
      rotationDeg: 0,
      locked,
      ...dbh,
    };
    return { ...parts, items: [...parts.items, item] };
  }
  if (feature.polygon === null) return parts;
  const areaCatalog = OUTLINE_CATALOG[feature.kind];
  if (areaCatalog !== undefined) {
    // The outline is the park as it is today, so its ground is not held to the rules for new areas.
    const area = {
      id,
      catalogId: areaCatalog,
      polygon: feature.polygon,
      locked,
      existing: true,
      ...recordedPlotsOf(feature),
    };
    return { ...parts, areas: [...parts.areas, area] };
  }
  const building = {
    id,
    catalogId: BUILDING_CATALOG,
    position: centreOf(feature.polygon),
    rotationDeg: 0,
    locked,
  };
  return feature.kind === 'building' ? { ...parts, items: [...parts.items, building] } : parts;
}

/** The park as it is today, from the reviewed features and the lock chosen for each. */
export function proposedBaseline(
  features: readonly ProposedFeature[],
  locks: Locks,
): DesignDocument {
  const parts = placeableFeatures(features).reduce<Parts>(
    (current, feature) => addFeature(current, feature, locks[feature.id] ?? 'unlocked'),
    { items: [], areas: [] },
  );
  return designDocumentSchema.parse({
    version: 1,
    ...parts,
    paths: [],
    gradeDelta: { cells: [] },
    zones: [],
  });
}

/** Zones drawn on the baseline go to the project, so every design inherits them. */
export function withoutZones(document: DesignDocument): {
  readonly document: DesignDocument;
  readonly zones: readonly Zone[];
} {
  return { document: { ...document, zones: [] }, zones: document.zones };
}
