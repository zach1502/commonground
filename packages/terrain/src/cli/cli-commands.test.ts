import { copyFile, mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, describe, expect, it } from 'vitest';

import { makeSyntheticCog, serveRanges } from '../adapters/cog/__contracts__/synthetic-cog.js';
import { replayFetch } from '../adapters/http/recorded-fetch.js';
import { JONATHAN_ROGERS_POLYGON } from '../ports/__contracts__/jonathan-rogers.js';
import type { HttpFetch } from '../ports/http.js';

import { fetchSite, FETCH_SITE_USAGE } from './fetch-site-command.js';
import { fetchTerrain, FETCH_TERRAIN_USAGE } from './fetch-terrain-command.js';

const FIXTURE = new URL('../../fixtures/jonathan-rogers/', import.meta.url);
const RAW = new URL('raw/', FIXTURE);
const HRDEM_DTM =
  'https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-mosaic-1m/2_3-mosaic-1m-dtm.tif';
const recorded = replayFetch(async (name) =>
  readFile(new URL(name, RAW), 'utf8').catch(() => undefined),
);
const withCog: HttpFetch = serveRanges(
  {
    url: HRDEM_DTM,
    bytes: makeSyntheticCog({ polygonWgs84: JONATHAN_ROGERS_POLYGON, pixelSizeM: 1 }).bytes,
  },
  recorded,
).fetch;

const tempDirs: string[] = [];
afterAll(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'parkshape-cli-'));
  tempDirs.push(dir);
  return dir;
}

function logger() {
  const lines: string[] = [];
  return { lines, log: (line: string) => lines.push(line) };
}

describe('fetchSite', () => {
  it('writes features.json with Vancouver trees and OSM footprints and reports the counts', async () => {
    const out = await tempDir();
    const { lines, log } = logger();
    expect(await fetchSite(['--out', out], { fetch: recorded, log })).toBe(0);
    const written = JSON.parse(await readFile(join(out, 'features.json'), 'utf8')) as {
      features: unknown[];
    };
    expect(written.features).toHaveLength(26);
    expect(lines).toContain('trees: 22 (12 suggested locked)');
    expect(lines).toContain('gardens: 2 with 56 plots');
  });

  it('records raw responses when asked', async () => {
    const out = await tempDir();
    const { log } = logger();
    await fetchSite(['--out', out, '--record', '--skip-osm'], { fetch: recorded, log });
    expect((await readdir(join(out, 'raw'))).sort()).toEqual([
      'vancouver-community-gardens-and-food-trees.json',
      'vancouver-parks-polygon-representation.json',
      'vancouver-parks-special-features.json',
      'vancouver-public-trees.json',
    ]);
  });

  it('keeps going without OSM when Overpass fails', async () => {
    const out = await tempDir();
    const { lines, log } = logger();
    const noOsm: HttpFetch = (url, init) =>
      url.includes('overpass')
        ? Promise.resolve(new Response('busy', { status: 504 }))
        : recorded(url, init);
    expect(await fetchSite(['--out', out], { fetch: noOsm, log })).toBe(0);
    expect(lines.some((line) => line.startsWith('OpenStreetMap skipped'))).toBe(true);
  });

  it('prints usage for an unknown flag', async () => {
    const { lines, log } = logger();
    expect(await fetchSite(['--parkname', 'X'], { fetch: recorded, log })).toBe(2);
    expect(lines).toEqual([FETCH_SITE_USAGE]);
  });

  it('fails when Vancouver Open Data fails', async () => {
    const { log } = logger();
    const down: HttpFetch = () => Promise.resolve(new Response('down', { status: 500 }));
    expect(await fetchSite(['--out', await tempDir()], { fetch: down, log })).toBe(1);
  });
});

describe('fetchTerrain', () => {
  it('reads the parcel from features.json and writes the heightmap pair', async () => {
    const out = await tempDir();
    await copyFile(new URL('features.json', FIXTURE), join(out, 'features.json'));
    const { lines, log } = logger();
    expect(await fetchTerrain(['--out', out, '--provider', 'chain'], { fetch: withCog, log })).toBe(
      0,
    );
    expect((await readdir(out)).sort()).toEqual([
      'features.json',
      'heightmap.bin',
      'heightmap.json',
    ]);
    expect(lines).toContain('source: NRCan HRDEM, read in EPSG:3979');
    expect(lines).toContain('attempts: hrdem succeeded');
  });

  it('prints usage for an unknown provider', async () => {
    const { lines, log } = logger();
    expect(await fetchTerrain(['--provider', 'dsm'], { fetch: withCog, log })).toBe(2);
    expect(lines).toEqual([FETCH_TERRAIN_USAGE]);
  });

  it('prints usage for an unknown flag', async () => {
    const { lines, log } = logger();
    expect(await fetchTerrain(['--dsm'], { fetch: withCog, log })).toBe(2);
    expect(lines).toEqual([FETCH_TERRAIN_USAGE]);
  });

  it('asks for fetch-site first when there is no parcel', async () => {
    const { lines, log } = logger();
    expect(await fetchTerrain(['--out', await tempDir()], { fetch: withCog, log })).toBe(1);
    expect(lines[0]).toMatch(/run fetch-site first/);
  });

  it('fails when every terrain source fails', async () => {
    const out = await tempDir();
    await copyFile(new URL('features.json', FIXTURE), join(out, 'features.json'));
    const { lines, log } = logger();
    expect(
      await fetchTerrain(['--out', out, '--provider', 'mrdem'], { fetch: recorded, log }),
    ).toBe(1);
    expect(lines[0]).toMatch(/terrain fetch failed/);
  });
});
