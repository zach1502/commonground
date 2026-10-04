import type { Zone } from '../schema/design.js';
import { isExistingFeatureId, type ItemId } from '../schema/ids.js';

import type { Footprint } from './footprints.js';
import { intersectCount, rasterizePolygon } from './raster.js';

export interface ZoneHit {
  readonly elementId: ItemId;
  readonly label: string;
  readonly zoneId: ItemId;
  readonly zoneLabel: string;
}

export interface LockedOverlap {
  readonly elementId: ItemId;
  readonly label: string;
  readonly lockedId: ItemId;
  readonly lockedLabel: string;
}

/** New elements that cover any cell of a forbidden zone. Locked elements were there first. */
export function forbiddenZoneHits(
  footprints: readonly Footprint[],
  zones: readonly Zone[],
): ZoneHit[] {
  const free = footprints.filter((footprint) => !footprint.locked);
  const [first] = free;
  if (first === undefined) return [];
  const forbidden = zones
    .filter((zone) => zone.kind === 'forbidden')
    .map((zone) => ({ zone, mask: rasterizePolygon(first.mask.grid, zone.polygon) }));
  return free.flatMap((footprint) =>
    forbidden
      .filter(({ mask }) => intersectCount(footprint.mask, mask) > 0)
      .map(({ zone }) => ({
        elementId: footprint.id,
        label: footprint.label,
        zoneId: zone.id,
        zoneLabel: zone.label,
      })),
  );
}

/**
 * Two features of today's park that overlap, such as a locked tree that stands in the existing
 * community garden, are how the site is now. The rule is about what a design adds, so it skips
 * them. A new element, or an existing one placed over a new locked element, still counts.
 */
function bothExistToday(footprint: Footprint, other: Footprint): boolean {
  return isExistingFeatureId(footprint.id) && isExistingFeatureId(other.id);
}

/** Each new element that shares a cell with a locked element. */
export function lockedOverlaps(footprints: readonly Footprint[]): LockedOverlap[] {
  const locked = footprints.filter((footprint) => footprint.locked);
  return footprints
    .filter((footprint) => !footprint.locked)
    .flatMap((footprint) =>
      locked
        .filter((other) => !bothExistToday(footprint, other))
        .filter((other) => intersectCount(footprint.mask, other.mask) > 0)
        .map((other) => ({
          elementId: footprint.id,
          label: footprint.label,
          lockedId: other.id,
          lockedLabel: other.label,
        })),
    );
}
