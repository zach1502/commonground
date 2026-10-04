import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { HrdemCogProvider } from '../adapters/cog/cog-terrain-providers.js';
import { findDtmItem } from '../adapters/cog/stac.js';
import { OsmOverpassProvider } from '../adapters/osm/osm-overpass-provider.js';
import { VancouverOpenDataProvider } from '../adapters/vancouver/vancouver-open-data-provider.js';
import {
  JONATHAN_ROGERS_PARK_NAME,
  JONATHAN_ROGERS_POLYGON,
} from '../ports/__contracts__/jonathan-rogers.js';

// @live: these call the real services and compare with the recordings in fixtures/raw.
// Run them with `pnpm --filter @parkshape/terrain test:live` after changing an adapter.
const RAW = new URL('../../fixtures/jonathan-rogers/raw/', import.meta.url);
const TIMEOUT_MS = 60_000;
// HRDEM mosaics are rebuilt now and then; allow small changes against the recording.
const ELEVATION_TOLERANCE_M = 0.5;

async function recordedCount(name: string): Promise<number> {
  const body = JSON.parse(await readFile(new URL(name, RAW), 'utf8')) as { total_count: number };
  return body.total_count;
}

describe('@live Jonathan Rogers Park sources', () => {
  it('finds the same park and tree count as the recording', { timeout: TIMEOUT_MS }, async () => {
    const result = await new VancouverOpenDataProvider({ fetch: globalThis.fetch }).getFeatures({
      parkName: JONATHAN_ROGERS_PARK_NAME,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const trees = result.value.features.filter((feature) => feature.kind === 'tree');
    expect(trees).toHaveLength(await recordedCount('vancouver-public-trees.json'));
  });

  it('finds an HRDEM item in EPSG:3979 with a DTM asset', { timeout: TIMEOUT_MS }, async () => {
    const item = await findDtmItem({
      fetch: globalThis.fetch,
      stacUrl: 'https://datacube.services.geo.ca/stac/api/search',
      collection: 'hrdem-mosaic-1m',
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
    });
    expect(item).toMatchObject({ ok: true, value: { epsg: 3979, asset: { key: 'dtm' } } });
  });

  it(
    'reads a DTM window that matches the recorded heightmap',
    { timeout: TIMEOUT_MS },
    async () => {
      const result = await new HrdemCogProvider({ fetch: globalThis.fetch }).getHeightmap({
        polygonWgs84: JONATHAN_ROGERS_POLYGON,
        resolutionM: 1,
      });
      if (!result.ok) throw new Error(JSON.stringify(result.error));
      const bytes = await readFile(new URL('../heightmap.bin', RAW));
      const recorded = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
      const { elevations } = result.value.heightmap;
      const worst = elevations.reduce(
        (most, value, index) => Math.max(most, Math.abs(value - (recorded[index] ?? 0))),
        0,
      );
      expect(worst).toBeLessThan(ELEVATION_TOLERANCE_M);
    },
  );

  it('gets footprints from Overpass', { timeout: TIMEOUT_MS }, async () => {
    const result = await new OsmOverpassProvider({ fetch: globalThis.fetch }).getFeatures({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
    });
    // The public Overpass server answers 429 or 504 when busy; the error says which.
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    expect(result.value.features.some((feature) => feature.kind === 'garden')).toBe(true);
  });
});
