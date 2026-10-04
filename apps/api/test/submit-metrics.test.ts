import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { makeFlatHeightmap } from '@parkshape/core';
import { encodeHeightmap, writeStoredHeightmap, type GeoJsonPolygon } from '@parkshape/terrain';

import { errorBodySchema } from '../src/contracts/common.js';
import { designSchema } from '../src/contracts/projects-designs.js';

import {
  GARDEN,
  SMALL_GARDEN,
  createDraft,
  createProject,
  submitDocument,
  submitGarden,
} from './fixtures.js';
import { BOB, STAFF, errorKind, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let bob: string;

beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' });
  staff = await h.login(STAFF);
  bob = await h.login(BOB);
});

afterAll(async () => {
  await h.close();
});

const SOURCE = { name: 'Test grid', licence: 'CC0', url: 'https://example.test' };
const POLYGON: GeoJsonPolygon = {
  type: 'Polygon',
  coordinates: [
    [
      [-123.098, 49.263],
      [-123.096, 49.263],
      [-123.096, 49.264],
      [-123.098, 49.263],
    ],
  ],
};

async function storeTerrain(baseKey: string, elevationM: number) {
  const heightmap = makeFlatHeightmap({ width: 120, height: 120, elevationM });
  const stored = encodeHeightmap({
    result: { heightmap, source: SOURCE, crs: 'EPSG:3979' },
    polygonWgs84: POLYGON,
    frameOrigin: { lat: 49.263, lon: -123.098 },
  });
  await writeStoredHeightmap(h.deps.blobStore, baseKey, stored);
}

describe('server-side metrics on submit', () => {
  it('measures on the stored heightmap named by the project heightmapRef', async () => {
    await storeTerrain('terrain/stored-park', 20);
    const project = await createProject(h, staff, { heightmapRef: 'terrain/stored-park.bin' });
    const design = await submitGarden(h, bob, project.id);
    expect(design.metrics?.heightmapSource).toBe('stored');
    expect(design.metrics?.totals.costCad).toBe(24 * 900);
  });

  it('falls back to a flat grid of the parcel size when no heightmap is stored', async () => {
    const project = await createProject(h, staff, { heightmapRef: 'terrain/never-fetched.bin' });
    const design = await submitGarden(h, bob, project.id);
    expect(design.metrics?.heightmapSource).toBe('flat');
    expect(design.metrics?.isSubmittable).toBe(true);
  });

  it('refuses to measure on a stored heightmap that does not decode', async () => {
    await h.deps.blobStore.put('terrain/broken.json', new Uint8Array([123]), 'application/json');
    await h.deps.blobStore.put('terrain/broken.bin', new Uint8Array(4), 'application/octet-stream');
    const project = await createProject(h, staff, { heightmapRef: 'terrain/broken.bin' });
    const response = await submitDocument(h, bob, project.id, GARDEN);
    expect(response.status).toBe(500);
    expect(errorBodySchema.parse(response.body).error.kind).toBe('internal');
  });

  it('refuses a submit when a save replaced the draft while its metrics ran', async () => {
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    const save = (document: typeof GARDEN) =>
      h.call('PUT', `/designs/${draft.id}`, {
        cookie: bob,
        body: { title: 'Garden corner', blurb: 'Beds by the lane.', document },
      });
    await save(GARDEN);
    const measure = h.deps.metrics.measure.bind(h.deps.metrics);
    const spy = vi.spyOn(h.deps.metrics, 'measure').mockImplementationOnce(async (job) => {
      const outcome = await measure(job);
      await save(SMALL_GARDEN);
      return outcome;
    });
    const raced = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
    spy.mockRestore();
    expect(raced.status).toBe(409);
    expect(errorKind(raced.body)).toBe('wrong-status');
    const stored = designSchema.parse(
      (await h.call('GET', `/designs/${draft.id}`, { cookie: bob })).body,
    );
    expect(stored).toMatchObject({ status: 'draft', metrics: null, document: SMALL_GARDEN });
    const again = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
    expect(again.body).toMatchObject({
      status: 'draft',
      hardFailures: [{ key: 'requiredFeatures' }],
    });
  });
});
