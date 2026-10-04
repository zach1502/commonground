import { rasterizePolygon, type Mask } from '../metrics/raster.js';
import type { PlanePoint } from '../schema/geometry.js';

import type { PlannedFeature, Replacement } from './features.js';
import { hintMet, type ResolvedHint } from './hints.js';
import { cellAt, distanceField, type Site } from './site.js';

function centroidOf(polygon: readonly PlanePoint[]): PlanePoint {
  const total = polygon.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / polygon.length, y: total.y / polygon.length };
}

export function originalMask(site: Site, replacement: Replacement): Mask {
  return rasterizePolygon(site.grid, replacement.area.polygon);
}

/**
 * The hints to rank spots by. A resized area the intent gives no placement for is pulled
 * toward where it is now. That pull only ranks spots and is never reported as a missed hint.
 */
export function rankingHints(
  site: Site,
  feature: PlannedFeature,
  hints: readonly ResolvedHint[],
): readonly ResolvedHint[] {
  const original = feature.replaces;
  if (original === undefined || hints.length > 0) return hints;
  const place = feature.entry.name.toLowerCase();
  return [{ hint: { kind: 'near', place }, distance: distanceField(originalMask(site, original)) }];
}

/** A move whose every hint the existing area already meets leaves the area where it is. */
export function alreadyThere(
  site: Site,
  replacement: Replacement,
  hints: readonly ResolvedHint[],
): boolean {
  if (replacement.change !== 'move') return false;
  const cell = cellAt(site.grid, centroidOf(replacement.area.polygon));
  return cell !== undefined && hints.every((hint) => hintMet(hint, cell));
}
