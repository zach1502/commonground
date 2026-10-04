import { plotsRecordedInside } from '@parkshape/core';

import type { ProposedFeature } from './ports/site-features-provider.js';

/**
 * Garden records (Vancouver Open Data) carry the plot count at a point, and garden outlines
 * (OpenStreetMap) carry the shape. Each outline without a count takes the plots of the records
 * inside it, so the baseline garden reports the leased plots instead of fitted beds.
 */
export function withRecordedGardenPlots(features: readonly ProposedFeature[]): ProposedFeature[] {
  const records = features.flatMap((feature) =>
    feature.kind === 'garden' && 'position' in feature
      ? [{ position: feature.position, plots: feature.attributes.plots }]
      : [],
  );
  return features.map((feature) => {
    if (feature.kind !== 'garden' || !('polygon' in feature)) return feature;
    if (feature.attributes.plots !== undefined) return feature;
    const plots = plotsRecordedInside(feature.polygon, records);
    return plots === undefined
      ? feature
      : { ...feature, attributes: { ...feature.attributes, plots } };
  });
}
