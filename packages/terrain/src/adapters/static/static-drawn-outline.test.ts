import { describe, expect, it } from 'vitest';

import { polygonContains } from '@parkshape/core';

import type { GeoJsonPolygon } from '../../geojson.js';
import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';
import type { ProposedFeature } from '../../ports/site-features-provider.js';

import { StaticSiteFeaturesProvider } from './static-site-features-provider.js';

// The south-west half of Jonathan Rogers Park, drawn as a triangle.
const TRIANGLE: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-123.1092, 49.264],
      [-123.107, 49.264],
      [-123.1092, 49.2646],
      [-123.1092, 49.264],
    ],
  ],
};

const anchorOf = (feature: ProposedFeature) =>
  'position' in feature ? feature.position : feature.polygon[0];

describe('StaticSiteFeaturesProvider with a drawn outline', () => {
  it('keeps the drawn triangle as the parcel, not the recorded box', async () => {
    const result = await new StaticSiteFeaturesProvider().getFeatures({ polygonWgs84: TRIANGLE });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const { parcel } = result.value;
    expect(parcel.polygonWgs84).toEqual(TRIANGLE);
    expect(parcel.polygonLocal).toHaveLength(3);
    expect(Math.min(...parcel.polygonLocal.map((point) => point.x))).toBeCloseTo(0, 6);
    expect(Math.min(...parcel.polygonLocal.map((point) => point.y))).toBeCloseTo(0, 6);
  });

  it('keeps only the recorded features inside the triangle, in its frame', async () => {
    const provider = new StaticSiteFeaturesProvider();
    const drawn = await provider.getFeatures({ polygonWgs84: TRIANGLE });
    const whole = await provider.getFeatures({ polygonWgs84: JONATHAN_ROGERS_POLYGON });
    if (!drawn.ok || !whole.ok) throw new Error('fixture missing');
    expect(drawn.value.features.length).toBeGreaterThan(0);
    expect(drawn.value.features.length).toBeLessThan(whole.value.features.length);
    drawn.value.features.forEach((feature) => {
      expect(polygonContains(drawn.value.parcel.polygonLocal, anchorOf(feature))).toBe(true);
    });
  });

  it('serves the recorded parcel unchanged for the recorded outline', async () => {
    const provider = new StaticSiteFeaturesProvider();
    const byOutline = await provider.getFeatures({ polygonWgs84: JONATHAN_ROGERS_POLYGON });
    const byName = await provider.getFeatures({ parkName: 'Jonathan Rogers Park' });
    expect(byOutline).toEqual(byName);
  });
});
