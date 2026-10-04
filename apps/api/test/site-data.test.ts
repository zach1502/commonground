import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { readStoredHeightmap } from '@parkshape/terrain';

import { siteFeaturesResultSchema, terrainResultSchema } from '../src/contracts/site.js';
import { heightmapBaseKey } from '../src/rules/heightmap.js';

import { JONATHAN_ROGERS_OUTLINE } from './fixtures.js';
import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

const FAR_AWAY = {
  type: 'Polygon',
  coordinates: [
    [
      [-120, 50],
      [-119.99, 50],
      [-119.99, 50.01],
      [-120, 50],
    ],
  ],
};

let h: Harness;
let staff: string;
let resident: string;

beforeAll(async () => {
  h = await startHarness({ TERRAIN_PROVIDER: 'static', SITE_FEATURES_PROVIDER: 'static' });
  staff = await h.login(STAFF);
  resident = await h.login(BOB);
});

afterAll(async () => {
  await h.close();
});

describe('POST /terrain', () => {
  it('stores the heightmap and names the provider that supplied it', async () => {
    const body = { polygonWgs84: JONATHAN_ROGERS_OUTLINE, resolutionM: 2 };
    const response = await h.call('POST', '/terrain', { cookie: staff, body });
    expect(response.status).toBe(201);
    const result = terrainResultSchema.parse(response.body);
    expect(result.provider).toBe('static');
    expect(result.source.name).toBe('NRCan HRDEM');
    expect(result.resolutionM).toBe(2);
    const stored = await readStoredHeightmap(
      h.deps.blobStore,
      heightmapBaseKey(result.heightmapRef),
    );
    expect(stored.kind).toBe('found');
    if (stored.kind === 'found') {
      expect(stored.result.heightmap.width).toBe(result.width);
    }
  });

  it('refuses an area outside the data with 422', async () => {
    const body = { polygonWgs84: FAR_AWAY, resolutionM: 2 };
    const response = await h.call('POST', '/terrain', { cookie: staff, body });
    expect(response.status).toBe(422);
    expect(errorKind(response.body)).toBe('site-data-unavailable');
  });

  it('rejects a bad polygon with 400', async () => {
    const body = { polygonWgs84: { type: 'Polygon', coordinates: [] }, resolutionM: 2 };
    expect((await h.call('POST', '/terrain', { cookie: staff, body })).status).toBe(400);
  });

  it('is for staff only', async () => {
    const body = { polygonWgs84: JONATHAN_ROGERS_OUTLINE, resolutionM: 2 };
    expect((await h.call('POST', '/terrain', { body })).status).toBe(401);
    expect((await h.call('POST', '/terrain', { cookie: resident, body })).status).toBe(403);
  });
});

describe('POST /site-features', () => {
  it('finds a park by name and returns its outline and features with map positions', async () => {
    const body = { parkName: 'Jonathan Rogers Park' };
    const response = await h.call('POST', '/site-features', { cookie: staff, body });
    expect(response.status).toBe(200);
    const result = siteFeaturesResultSchema.parse(response.body);
    expect(result.parkName).toBe('Jonathan Rogers Park');
    expect(result.parcel.polygonLocal.length).toBeGreaterThanOrEqual(3);
    const trees = result.features.filter((feature) => feature.kind === 'tree');
    expect(trees.length).toBe(22);
    const [tree] = trees;
    expect(tree?.datasetId).toBe('public-trees');
    expect(tree?.lonLat[0]).toBeCloseTo(-123.108, 2);
    expect(new Set(result.features.map((feature) => feature.id)).size).toBe(result.features.length);
  });

  it('accepts a drawn outline instead of a name', async () => {
    const body = { polygonWgs84: JONATHAN_ROGERS_OUTLINE };
    const response = await h.call('POST', '/site-features', { cookie: staff, body });
    expect(response.status).toBe(200);
    expect(siteFeaturesResultSchema.parse(response.body).parkName).toBeNull();
  });

  it('returns 404 for a park the source does not have', async () => {
    const body = { parkName: 'No Such Park' };
    const response = await h.call('POST', '/site-features', { cookie: staff, body });
    expect(response.status).toBe(404);
    expect(errorKind(response.body)).toBe('not-found');
  });

  it('needs a name or an outline', async () => {
    expect((await h.call('POST', '/site-features', { cookie: staff, body: {} })).status).toBe(400);
  });

  it('is for staff only', async () => {
    const body = { parkName: 'Jonathan Rogers Park' };
    expect((await h.call('POST', '/site-features', { body })).status).toBe(401);
    expect((await h.call('POST', '/site-features', { cookie: resident, body })).status).toBe(403);
  });
});
