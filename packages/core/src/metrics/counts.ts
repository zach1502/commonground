import type { Category } from '../schema/catalog.js';
import type { CountRange, RequiredFeature } from '../schema/parameters.js';

import type { Footprint } from './footprints.js';

export interface CountBreach {
  readonly category: Category;
  readonly count: number;
  readonly min?: number | undefined;
  readonly max?: number | undefined;
}

export interface FeatureShortfall {
  readonly feature: RequiredFeature;
  readonly count: number;
  /** Plots across the matching areas, as the gardenPlots total counts them. */
  readonly plots: number;
}

export function categoryCounts(footprints: readonly Footprint[]): ReadonlyMap<Category, number> {
  const counts = new Map<Category, number>();
  footprints.forEach(({ entry }) => {
    counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
  });
  return counts;
}

/** Categories whose count falls outside their range. */
export function countBreaches(
  counts: ReadonlyMap<Category, number>,
  ranges: readonly CountRange[],
): CountBreach[] {
  return ranges.flatMap(({ category, min, max }) => {
    const count = counts.get(category) ?? 0;
    const below = min !== undefined && count < min;
    const above = max !== undefined && count > max;
    return below || above ? [{ category, count, min, max }] : [];
  });
}

function matches(footprint: Footprint, feature: RequiredFeature): boolean {
  return 'category' in feature
    ? footprint.entry.category === feature.category
    : footprint.entry.id === feature.catalogId;
}

/** Required features with too few elements, or too few fitted plots when minPlots is set. */
export function featureShortfalls(
  footprints: readonly Footprint[],
  features: readonly RequiredFeature[],
): FeatureShortfall[] {
  return features.flatMap((feature) => {
    const matching = footprints.filter((footprint) => matches(footprint, feature));
    const plots = matching.reduce((total, footprint) => total + footprint.moduleCount, 0);
    const shortOfPlots = feature.minPlots !== undefined && plots < feature.minPlots;
    return matching.length < feature.minCount || shortOfPlots
      ? [{ feature, count: matching.length, plots }]
      : [];
  });
}
