import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';

import { findDtmItem, pickDtmAsset, type StacItem } from './stac.js';

const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

const RAW = new URL('../../../fixtures/jonathan-rogers/raw/', import.meta.url);
const recorded = (file: string): unknown => JSON.parse(readFileSync(new URL(file, RAW), 'utf8'));

function respondWith(body: unknown, status = 200) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const fetch = (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status }));
  };
  return { fetch, calls };
}

const asset = (title: string) => ({
  href: `https://example.test/${title}.tif`,
  type: 'image/tiff; application=geotiff; profile=cloud-optimized',
  roles: ['data'],
  title,
});

describe('pickDtmAsset', () => {
  it('picks the DTM COG from the recorded HRDEM item, never the DSM', () => {
    const body = recorded('stac-hrdem-mosaic-1m.json') as { features: StacItem[] };
    const item = body.features[0];
    if (item === undefined) throw new Error('recorded STAC response has no items');
    const picked = pickDtmAsset(item);
    expect(picked.ok && picked.value.key).toBe('dtm');
    expect(picked.ok && picked.value.href).toMatch(/-dtm\.tif$/);
    expect(picked.ok && picked.value.href).not.toMatch(/dsm/);
  });

  it('picks the DTM from the recorded MRDEM item', () => {
    const body = recorded('stac-mrdem-30.json') as { features: StacItem[] };
    const picked = body.features[0] && pickDtmAsset(body.features[0]);
    expect(picked?.ok && picked.value.href).toMatch(/mrdem-30-dtm\.tif$/);
  });

  it('never falls back to a DSM or a hillshade when no DTM exists', () => {
    const item: StacItem = {
      id: 'surface-only',
      properties: {},
      assets: {
        dsm: asset('Digital Surface Model (COG)'),
        'hillshade-dtm': asset('Shaded Relief of the Digital Terrain Model (COG)'),
        'dtm-vrt': { ...asset('Digital Terrain Model (VRT)'), type: 'application/xml' },
      },
    };
    expect(pickDtmAsset(item)).toEqual({
      ok: false,
      error: { kind: 'noDtmAsset', itemId: 'surface-only' },
    });
  });

  it('finds a terrain asset by its title when the key is not dtm', () => {
    const item: StacItem = {
      id: 'titled',
      properties: {},
      assets: { dsm: asset('Digital Surface Model'), elevation: asset('Digital Terrain Model') },
    };
    expect(pickDtmAsset(item)).toMatchObject({ ok: true, value: { key: 'elevation' } });
  });
});

describe('findDtmItem', () => {
  const search = { stacUrl: 'https://stac.test/search', collection: 'hrdem-mosaic-1m' };

  it('posts an intersects search for the collection and reads proj:epsg', async () => {
    const { fetch, calls } = respondWith(recorded('stac-hrdem-mosaic-1m.json'));
    const found = await findDtmItem({ ...search, fetch, polygonWgs84: JONATHAN_ROGERS_POLYGON });
    expect(found).toMatchObject({ ok: true, value: { itemId: '2_3-mosaic-1m', epsg: 3979 } });
    expect(calls[0]?.init?.method).toBe('POST');
    const body = JSON.parse(bodyText(calls[0]?.init)) as Record<string, unknown>;
    expect(body).toMatchObject({
      collections: ['hrdem-mosaic-1m'],
      intersects: { type: 'Polygon' },
    });
  });

  it('reports no coverage when the search returns no items', async () => {
    const { fetch } = respondWith({ type: 'FeatureCollection', features: [] });
    const found = await findDtmItem({ ...search, fetch, polygonWgs84: JONATHAN_ROGERS_POLYGON });
    expect(found).toEqual({
      ok: false,
      error: { kind: 'noCoverage', collection: 'hrdem-mosaic-1m' },
    });
  });

  it('reports an HTTP error status', async () => {
    const { fetch } = respondWith({}, 503);
    const found = await findDtmItem({ ...search, fetch, polygonWgs84: JONATHAN_ROGERS_POLYGON });
    expect(found).toMatchObject({ ok: false, error: { kind: 'httpStatus', status: 503 } });
  });

  it('reports a body that is not a STAC item collection', async () => {
    const { fetch } = respondWith({ features: 'nope' });
    const found = await findDtmItem({ ...search, fetch, polygonWgs84: JONATHAN_ROGERS_POLYGON });
    expect(found).toMatchObject({ ok: false, error: { kind: 'invalidResponse' } });
  });

  it('reports a network failure', async () => {
    const fetch = () => Promise.reject(new Error('offline'));
    const found = await findDtmItem({ ...search, fetch, polygonWgs84: JONATHAN_ROGERS_POLYGON });
    expect(found).toMatchObject({ ok: false, error: { kind: 'network', message: 'offline' } });
  });
});
