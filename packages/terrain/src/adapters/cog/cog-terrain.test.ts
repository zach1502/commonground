import { describe, expect, it } from 'vitest';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';
import type { CachedBlob, CacheStore } from '../../ports/cache-store.js';
import type { HttpFetch } from '../../ports/http.js';
import { localFrameFor, reprojectorFor } from '../projection/local-frame.js';

import {
  makeSyntheticCog,
  planeAt,
  serveRanges,
  stacResponseFor,
  type SyntheticCog,
} from './__contracts__/synthetic-cog.js';
import { HrdemCogProvider, MrdemProvider } from './cog-terrain-providers.js';

const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

const STAC_URL = 'https://stac.test/search';
const DTM_URL = 'https://cogs.test/area-dtm.tif';
const request = { polygonWgs84: JONATHAN_ROGERS_POLYGON, resolutionM: 1 };

interface Setup {
  readonly cog?: SyntheticCog;
  readonly stacEpsg?: number | undefined;
}

function serve(setup: Setup = {}) {
  const cog =
    setup.cog ?? makeSyntheticCog({ polygonWgs84: JONATHAN_ROGERS_POLYGON, pixelSizeM: 1 });
  const urls: string[] = [];
  const stacEpsg = 'stacEpsg' in setup ? setup.stacEpsg : 3979;
  const stac: HttpFetch = (url) => {
    if (url !== STAC_URL) return Promise.resolve(new Response('not found', { status: 404 }));
    return Promise.resolve(Response.json(stacResponseFor(DTM_URL, stacEpsg)));
  };
  const server = serveRanges({ url: DTM_URL, bytes: cog.bytes }, stac);
  const fetch: HttpFetch = (url, init) => {
    urls.push(url);
    return server.fetch(url, init);
  };
  return { cog, fetch, urls, ranges: server.ranges };
}

class MapCache implements CacheStore {
  readonly entries = new Map<string, CachedBlob>();
  get(key: string) {
    return Promise.resolve(this.entries.get(key));
  }
  put(key: string, bytes: Uint8Array, contentType: string) {
    this.entries.set(key, { bytes, contentType });
    return Promise.resolve();
  }
}

describe('HrdemCogProvider', () => {
  it('resamples the DTM onto the local grid with bilinear interpolation', async () => {
    const { cog, fetch } = serve();
    const result = await new HrdemCogProvider({ fetch, stacUrl: STAC_URL }).getHeightmap(request);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const { heightmap } = result.value;
    const frame = localFrameFor(JONATHAN_ROGERS_POLYGON);
    const lambert = reprojectorFor(3979);
    if (!lambert.ok) throw new Error('no EPSG:3979');
    const probe = { i: 40, j: 20 };
    const centre = {
      x: (probe.i + 0.5) * heightmap.resolutionM,
      y: (probe.j + 0.5) * heightmap.resolutionM,
    };
    const expected = planeAt(cog.plane, lambert.value.fromWgs84(frame.toWgs84(centre)));
    expect(heightmap.elevations[probe.j * heightmap.width + probe.i]).toBeCloseTo(expected, 3);
    expect(result.value.crs).toBe('EPSG:3979');
    expect(result.value.source.name).toBe('NRCan HRDEM');
  });

  it('reads the COG with range requests and never touches the DSM', async () => {
    const { fetch, urls, ranges } = serve();
    await new HrdemCogProvider({ fetch, stacUrl: STAC_URL }).getHeightmap(request);
    expect(ranges.length).toBeGreaterThan(0);
    expect(urls.some((url) => url.includes('dsm'))).toBe(false);
  });
});

describe('HrdemCogProvider CRS checks', () => {
  it('falls back to the COG geokeys when the STAC item has no proj:epsg', async () => {
    const { fetch } = serve({ stacEpsg: undefined });
    const result = await new HrdemCogProvider({ fetch, stacUrl: STAC_URL }).getHeightmap(request);
    expect(result.ok && result.value.crs).toBe('EPSG:3979');
  });

  it('refuses a COG whose geokeys disagree with the STAC item', async () => {
    const cog = makeSyntheticCog({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
      pixelSizeM: 1,
      epsg: 32610,
    });
    const { fetch } = serve({ cog });
    const result = await new HrdemCogProvider({ fetch, stacUrl: STAC_URL }).getHeightmap(request);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'crsMismatch', stacEpsg: 3979, cogEpsg: 32610 },
    });
  });

  it('refuses a CRS it cannot project to', async () => {
    const cog = makeSyntheticCog({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
      pixelSizeM: 1,
      epsg: 2154,
    });
    const { fetch } = serve({ cog, stacEpsg: 2154 });
    const result = await new HrdemCogProvider({ fetch, stacUrl: STAC_URL }).getHeightmap(request);
    expect(result).toEqual({ ok: false, error: { kind: 'unsupportedCrs', crs: 'EPSG:2154' } });
  });
});

describe('HrdemCogProvider failures and cache', () => {
  it('reports cells that land on no-data pixels', async () => {
    const holes = Array.from({ length: 20_000 }, (_, index) => index + 20_000);
    const cog = makeSyntheticCog({
      polygonWgs84: JONATHAN_ROGERS_POLYGON,
      pixelSizeM: 1,
      noDataPixels: holes,
    });
    const { fetch } = serve({ cog });
    const result = await new HrdemCogProvider({ fetch, stacUrl: STAC_URL }).getHeightmap(request);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind).toBe('noData');
  });

  it('serves a second identical request from the cache without fetching', async () => {
    const { fetch, urls } = serve();
    const cache = new MapCache();
    const provider = new HrdemCogProvider({ fetch, stacUrl: STAC_URL, cache });
    const first = await provider.getHeightmap(request);
    const fetchesAfterFirst = urls.length;
    const second = await provider.getHeightmap(request);
    expect(urls.length).toBe(fetchesAfterFirst);
    expect(second.ok && [...second.value.heightmap.elevations]).toEqual(
      first.ok && [...first.value.heightmap.elevations],
    );
    expect(cache.entries.size).toBe(2);
  });

  it('passes STAC errors through', async () => {
    const fetch: HttpFetch = () => Promise.resolve(new Response('busy', { status: 503 }));
    const result = await new HrdemCogProvider({ fetch, stacUrl: STAC_URL }).getHeightmap(request);
    expect(!result.ok && result.error.kind).toBe('httpStatus');
  });

  it('reports a COG that cannot be opened', async () => {
    const fetch: HttpFetch = (url) =>
      Promise.resolve(
        url === STAC_URL
          ? Response.json(stacResponseFor(DTM_URL, 3979))
          : new Response('gone', { status: 404 }),
      );
    const result = await new HrdemCogProvider({ fetch, stacUrl: STAC_URL }).getHeightmap(request);
    expect(!result.ok && result.error.kind).toBe('network');
  });
});

describe('MrdemProvider', () => {
  it('searches the mrdem-30 collection and resamples 30 m pixels to the requested grid', async () => {
    const cog = makeSyntheticCog({ polygonWgs84: JONATHAN_ROGERS_POLYGON, pixelSizeM: 30 });
    const { fetch } = serve({ cog });
    const bodies: string[] = [];
    const recording: HttpFetch = (url, init) => {
      if (url === STAC_URL) bodies.push(bodyText(init));
      return fetch(url, init);
    };
    const result = await new MrdemProvider({ fetch: recording, stacUrl: STAC_URL }).getHeightmap(
      request,
    );
    expect(result.ok && result.value.source.name).toBe('NRCan MRDEM');
    expect(bodies[0]).toContain('"mrdem-30"');
  });
});
