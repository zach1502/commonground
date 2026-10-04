import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makeRampHeightmap } from '@parkshape/core';
import { encodeHeightmap, writeStoredHeightmap, type GeoJsonPolygon } from '@parkshape/terrain';

import { projectTerrainSchema } from '../src/contracts/projects-designs.js';

import { createProject } from './fixtures.js';
import { MOLLY, STAFF, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let molly: string;

beforeAll(async () => {
  h = await startHarness();
  staff = await h.login(STAFF);
  molly = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

const SIDE = 120;
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

async function storeRamp(baseKey: string) {
  const heightmap = makeRampHeightmap({ width: SIDE, height: SIDE, gradeY: 0.25 });
  const stored = encodeHeightmap({
    result: { heightmap, source: SOURCE, crs: 'EPSG:3979' },
    polygonWgs84: POLYGON,
    frameOrigin: { lat: 49.263, lon: -123.098 },
  });
  await writeStoredHeightmap(h.deps.blobStore, baseKey, stored);
  return heightmap;
}

function elevationsOf(base64: string): number[] {
  const bytes = Buffer.from(base64, 'base64');
  return Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4));
}

describe('GET /projects/{id}/terrain', () => {
  it('returns the stored heightmap the live 3D views draw', async () => {
    const heightmap = await storeRamp('terrain/live-ramp');
    const project = await createProject(h, staff, { heightmapRef: 'terrain/live-ramp.bin' });
    const response = await h.call('GET', `/projects/${project.id}/terrain`, { cookie: molly });
    expect(response.status).toBe(200);
    const terrain = projectTerrainSchema.parse(response.body);
    expect(terrain).toMatchObject({ source: 'stored', width: SIDE, height: SIDE, resolutionM: 1 });
    expect(elevationsOf(terrain.elevations)).toEqual(Array.from(heightmap.elevations));
  });

  it('returns a flat grid over the parcel when no heightmap is stored', async () => {
    const project = await createProject(h, staff, { heightmapRef: 'terrain/none.bin' });
    const response = await h.call('GET', `/projects/${project.id}/terrain`, { cookie: molly });
    const terrain = projectTerrainSchema.parse(response.body);
    expect(terrain.source).toBe('flat');
    expect(new Set(elevationsOf(terrain.elevations))).toEqual(new Set([0]));
  });

  it('answers 404 for an unknown project', async () => {
    const response = await h.call('GET', '/projects/nope/terrain', { cookie: molly });
    expect(response.status).toBe(404);
  });
});
