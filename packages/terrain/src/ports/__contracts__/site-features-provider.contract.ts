import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { polygonContains, type PlanePoint } from '@parkshape/core';

import type {
  ProposedFeature,
  SiteFeaturesProvider,
  SiteFeaturesRequest,
} from '../site-features-provider.js';

// The parcel box minimum should sit on the local origin, give or take float noise.
const ORIGIN_TOLERANCE_M = 1e-3;

const sourcesFile = new URL('../../adapters/sources.json', import.meta.url);
const sourceNames = (JSON.parse(readFileSync(sourcesFile, 'utf8')) as { source: string }[]).map(
  (entry) => entry.source,
);

function anchorOf(feature: ProposedFeature): PlanePoint {
  if ('position' in feature) return feature.position;
  const ring = feature.polygon;
  return {
    x: ring.reduce((total, point) => total + point.x, 0) / ring.length,
    y: ring.reduce((total, point) => total + point.y, 0) / ring.length,
  };
}

async function featuresFor(provider: SiteFeaturesProvider, request: SiteFeaturesRequest) {
  const result = await provider.getFeatures(request);
  if (!result.ok) throw new Error(`provider failed: ${JSON.stringify(result.error)}`);
  return result.value;
}

/**
 * Behaviour every SiteFeaturesProvider adapter must have. Each adapter test calls this with a
 * factory and a request the adapter can serve from its fixtures.
 */
export function siteFeaturesProviderContract(
  name: string,
  makeProvider: () => SiteFeaturesProvider | Promise<SiteFeaturesProvider>,
  request: SiteFeaturesRequest,
): void {
  describe(`${name} meets the SiteFeaturesProvider contract`, () => {
    it('returns a parcel whose local bounding box starts at the origin', async () => {
      const { parcel } = await featuresFor(await makeProvider(), request);
      expect(parcel.polygonLocal.length).toBeGreaterThanOrEqual(3);
      expect(Math.min(...parcel.polygonLocal.map((p) => p.x))).toBeCloseTo(0, 2);
      expect(Math.abs(Math.min(...parcel.polygonLocal.map((p) => p.y)))).toBeLessThan(
        ORIGIN_TOLERANCE_M,
      );
      expect(parcel.polygonWgs84.type).toBe('Polygon');
      expect(Number.isFinite(parcel.origin.lat) && Number.isFinite(parcel.origin.lon)).toBe(true);
    });

    it('returns only features inside the parcel', async () => {
      const { parcel, features } = await featuresFor(await makeProvider(), request);
      expect(features.length).toBeGreaterThan(0);
      features.forEach((feature) => {
        expect(polygonContains(parcel.polygonLocal, anchorOf(feature))).toBe(true);
      });
    });

    it('gives every feature a provenance from a listed source', async () => {
      const { features } = await featuresFor(await makeProvider(), request);
      features.forEach(({ provenance }) => {
        expect(sourceNames).toContain(provenance.source);
        expect(provenance.datasetId).not.toBe('');
      });
    });

    it('rejects a request with neither a park name nor a polygon', async () => {
      const result = await (await makeProvider()).getFeatures({});
      expect(result.ok).toBe(false);
    });
  });
}
