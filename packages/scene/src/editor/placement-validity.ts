import {
  designFootprints,
  intersectCount,
  rasterizeOrientedRect,
  rasterizePolygon,
  SLOPE_TOLERANCE,
  type CatalogIndex,
  type DesignDocument,
  type Footprint,
  type Grid,
  type PlanePoint,
  type Zone,
} from '@parkshape/core';

export type BlockReason =
  'locked footprint' | 'forbidden zone' | 'too steep' | 'unknown item' | 'outside park';

export type PlacementValidity =
  | { readonly valid: true }
  | { readonly valid: false; readonly reason: BlockReason; readonly label: string };

export interface PlacementCandidate {
  readonly catalogId: string;
  readonly position: PlanePoint;
  readonly rotationDeg: number;
}

/** Rise over run of the ground at a point. */
export type SlopeSampler = (point: PlanePoint) => number;

export interface PlacementInput {
  readonly document: DesignDocument;
  readonly catalog: CatalogIndex;
  readonly candidate: PlacementCandidate;
  /** Project zones; the document's own zones are added to these. */
  readonly zones: readonly Zone[];
  readonly lockedFootprints: readonly Footprint[];
  readonly slopeSampler: SlopeSampler;
  readonly grid: Grid;
  /** Whether a point is on the parcel's ground; a parcel without an outline takes every point. */
  readonly onGround?: ((point: PlanePoint) => boolean) | undefined;
}

/** Footprints of the locked elements, rasterised the same way the metrics do. */
export function lockedFootprints(input: {
  readonly document: DesignDocument;
  readonly catalog: CatalogIndex;
  readonly grid: Grid;
}): Footprint[] {
  return designFootprints(input).filter((footprint) => footprint.locked);
}

const blocked = (reason: BlockReason, label: string): PlacementValidity => ({
  valid: false,
  reason,
  label,
});

/**
 * Whether a point item can go at the candidate spot. It uses the metrics' grid cells, so a
 * green ghost never lands where the submit check would report an overlap or a closed zone.
 * Labels are catalog ids for items, so the UI names them in its own language, and the
 * planner's own label for zones.
 */
export function validatePlacement(input: PlacementInput): PlacementValidity {
  const { candidate, grid } = input;
  const entry = input.catalog.get(candidate.catalogId);
  if (entry?.geometryKind !== 'point') return blocked('unknown item', candidate.catalogId);
  if (input.onGround?.(candidate.position) === false) return blocked('outside park', entry.id);
  const mask = rasterizeOrientedRect(grid, {
    centre: candidate.position,
    widthM: entry.footprint.widthM,
    depthM: entry.footprint.depthM,
    rotationDeg: candidate.rotationDeg,
  });
  const onLocked = input.lockedFootprints.find(
    (footprint) => intersectCount(mask, footprint.mask) > 0,
  );
  if (onLocked !== undefined) return blocked('locked footprint', onLocked.entry.id);
  const zone = [...input.zones, ...input.document.zones]
    .filter((entryZone) => entryZone.kind === 'forbidden')
    .find((entryZone) => intersectCount(mask, rasterizePolygon(grid, entryZone.polygon)) > 0);
  if (zone !== undefined) return blocked('forbidden zone', zone.label);
  const limit = entry.maxGrade;
  if (limit !== undefined && input.slopeSampler(candidate.position) > limit + SLOPE_TOLERANCE) {
    return blocked('too steep', entry.id);
  }
  return { valid: true };
}
