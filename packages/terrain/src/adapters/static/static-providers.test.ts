import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { makeRampHeightmap, sampleAt } from '@parkshape/core';

import type { GeoJsonPolygon } from '../../geojson.js';
import { encodeHeightmap } from '../../heightmap-codec.js';
import {
  JONATHAN_ROGERS_PARK_NAME,
  JONATHAN_ROGERS_POLYGON,
} from '../../ports/__contracts__/jonathan-rogers.js';
import { localFrameFor } from '../projection/local-frame.js';

import {
  readHeightmapFixture,
  readSiteFeaturesFixture,
  writeHeightmapFixture,
} from './fixture-files.js';
import { StaticHeightmapProvider } from './static-heightmap-provider.js';
import { StaticSiteFeaturesProvider } from './static-site-features-provider.js';

const tempDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'parkshape-terrain-'));
  tempDirs.push(dir);
  return dir;
}

const SOURCE = { name: 'NRCan HRDEM', licence: 'OGL-Canada', url: 'https://example.test' };

/** A 200 x 100 m ramp over the park, rising 0.1 m per metre east. */
function rampStored() {
  const heightmap = makeRampHeightmap({ width: 200, height: 100, gradeX: 0.1, baseM: 10 });
  const frameOrigin = localFrameFor(JONATHAN_ROGERS_POLYGON).origin;
  return encodeHeightmap({
    result: { heightmap, source: SOURCE, crs: 'EPSG:3979' },
    polygonWgs84: JONATHAN_ROGERS_POLYGON,
    frameOrigin,
  });
}

describe('StaticHeightmapProvider', () => {
  it('serves the recorded Jonathan Rogers heightmap at its own grid', async () => {
    const result = await new StaticHeightmapProvider().getHeightmap({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
      resolutionM: 1,
    });
    const fixture = await readHeightmapFixture(
      new URL('../../../fixtures/jonathan-rogers/', import.meta.url),
    );
    if (!result.ok || !fixture.ok) throw new Error('fixture missing');
    expect(result.value.heightmap.width).toBe(fixture.value.header.width);
    expect(result.value.heightmap.elevations[500]).toBeCloseTo(
      fixture.value.result.heightmap.elevations[500] ?? 0,
      4,
    );
  });

  it('resamples a smaller polygon inside the fixture in that polygon frame', async () => {
    const provider = new StaticHeightmapProvider({ stored: rampStored() });
    const inner: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-123.1085, 49.2641],
          [-123.1075, 49.2641],
          [-123.1075, 49.2645],
          [-123.1085, 49.2641],
        ],
      ],
    };
    const result = await provider.getHeightmap({ polygonWgs84: inner, resolutionM: 2 });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const outer = localFrameFor(JONATHAN_ROGERS_POLYGON);
    const own = localFrameFor(inner);
    const centre = { x: 1, y: 1 };
    const expected = sampleAt(
      makeRampHeightmap({ width: 200, height: 100, gradeX: 0.1, baseM: 10 }),
      outer.toLocal(own.toWgs84(centre)),
    );
    expect(result.value.heightmap.elevations[0]).toBeCloseTo(expected, 3);
  });
});

describe('StaticHeightmapProvider coverage', () => {
  it('refuses a polygon outside the fixture', async () => {
    const away: GeoJsonPolygon = {
      type: 'Polygon',
      coordinates: [
        [
          [-123.2, 49.3],
          [-123.199, 49.3],
          [-123.199, 49.301],
          [-123.2, 49.3],
        ],
      ],
    };
    const result = await new StaticHeightmapProvider({ stored: rampStored() }).getHeightmap({
      polygonWgs84: away,
      resolutionM: 1,
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'outsideCoverage', source: 'NRCan HRDEM' },
    });
  });
});

describe('StaticHeightmapProvider fixture files', () => {
  it('reports a fixture directory with no heightmap', async () => {
    const provider = new StaticHeightmapProvider({ fixtureDir: await tempDir() });
    const result = await provider.getHeightmap({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
      resolutionM: 1,
    });
    expect(!result.ok && result.error.kind).toBe('network');
  });

  it('reports stored bytes that do not match the header', async () => {
    const stored = { ...rampStored(), bytes: new Uint8Array(4) };
    const result = await new StaticHeightmapProvider({ stored }).getHeightmap({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
      resolutionM: 1,
    });
    expect(!result.ok && result.error.kind).toBe('invalidResponse');
  });

  it('reads back what writeHeightmapFixture wrote', async () => {
    const dir = await tempDir();
    await writeHeightmapFixture(dir, rampStored());
    const result = await new StaticHeightmapProvider({ fixtureDir: dir }).getHeightmap({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
      resolutionM: 1,
    });
    expect(result.ok && result.value.source).toEqual(SOURCE);
  });
});

describe('StaticSiteFeaturesProvider', () => {
  it('serves the recorded parcel and features', async () => {
    const result = await new StaticSiteFeaturesProvider().getFeatures({
      parkName: JONATHAN_ROGERS_PARK_NAME,
    });
    expect(
      result.ok && result.value.features.filter((feature) => feature.kind === 'tree'),
    ).toHaveLength(22);
  });

  it('gives the garden outline the 56 plots of the garden record inside it', async () => {
    const result = await new StaticSiteFeaturesProvider().getFeatures({
      parkName: JONATHAN_ROGERS_PARK_NAME,
    });
    const outlines = result.ok
      ? result.value.features.filter((feature) => feature.kind === 'garden' && 'polygon' in feature)
      : [];
    expect(outlines.map((feature) => feature.attributes.plots)).toEqual([56]);
  });

  it('reports a park other than the recorded one', async () => {
    const result = await new StaticSiteFeaturesProvider().getFeatures({ parkName: 'Other Park' });
    expect(result).toEqual({ ok: false, error: { kind: 'parkNotFound', parkName: 'Other Park' } });
  });

  it('serves an in-memory file', async () => {
    const file = await readSiteFeaturesFixture(
      new URL('../../../fixtures/jonathan-rogers/', import.meta.url),
    );
    if (!file.ok) throw new Error('fixture missing');
    const provider = new StaticSiteFeaturesProvider({ file: { ...file.value, features: [] } });
    const result = await provider.getFeatures({ polygonWgs84: JONATHAN_ROGERS_POLYGON });
    expect(result.ok && result.value.features).toEqual([]);
  });

  it('reports a features file that does not match the schema', async () => {
    const dir = await tempDir();
    await writeHeightmapFixture(dir, rampStored());
    await writeFile(join(dir, 'features.json'), '{"format":"other"}');
    const result = await new StaticSiteFeaturesProvider({ fixtureDir: dir }).getFeatures({
      parkName: 'X',
    });
    expect(!result.ok && result.error.kind).toBe('invalidResponse');
  });

  it('reports a missing features file', async () => {
    const result = await new StaticSiteFeaturesProvider({
      fixtureDir: await tempDir(),
    }).getFeatures({ parkName: 'X' });
    expect(!result.ok && result.error.kind).toBe('network');
  });
});
