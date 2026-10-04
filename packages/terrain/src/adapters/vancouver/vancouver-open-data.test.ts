import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  JONATHAN_ROGERS_PARK_NAME,
  JONATHAN_ROGERS_POLYGON,
} from '../../ports/__contracts__/jonathan-rogers.js';
import type { HttpFetch } from '../../ports/http.js';
import type { ProposedFeature } from '../../ports/site-features-provider.js';
import { replayFetch } from '../http/recorded-fetch.js';

import { VancouverOpenDataProvider } from './vancouver-open-data-provider.js';

const RAW = new URL('../../../fixtures/jonathan-rogers/raw/', import.meta.url);
const recorded = replayFetch(async (name) =>
  readFile(new URL(name, RAW), 'utf8').catch(() => undefined),
);

function withOverrides(overrides: Record<string, unknown>, calls: string[] = []): HttpFetch {
  return (url, init) => {
    calls.push(url);
    const dataset = Object.keys(overrides).find((id) => url.includes(`/datasets/${id}/`));
    return dataset === undefined
      ? recorded(url, init)
      : Promise.resolve(Response.json(overrides[dataset]));
  };
}

async function jonathanRogers(fetch: HttpFetch = recorded) {
  const result = await new VancouverOpenDataProvider({ fetch }).getFeatures({
    parkName: JONATHAN_ROGERS_PARK_NAME,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

const ofKind = (features: readonly ProposedFeature[], kind: string) =>
  features.filter((f) => f.kind === kind);

describe('VancouverOpenDataProvider', () => {
  it('maps the recorded public trees and suggests locking the ones over 30 cm', async () => {
    const trees = ofKind((await jonathanRogers()).features, 'tree');
    expect(trees).toHaveLength(22);
    expect(trees.filter((tree) => tree.suggestedLocked)).toHaveLength(12);
  });

  it('keeps species, trunk, height class, crown and provenance for each tree', async () => {
    const tree = ofKind((await jonathanRogers()).features, 'tree').find(
      (feature) => feature.provenance.recordId === '274379',
    );
    expect(tree).toMatchObject({
      catalogId: 'western-red-cedar',
      attributes: {
        name: 'Western red cedar',
        species: 'Thuja plicata',
        dbhCm: 61,
        heightRangeM: [9.1, 12.2],
        crownRadiusM: 5.5,
        crownRadiusMatureM: 5.5,
      },
      suggestedLocked: true,
      provenance: { source: 'Vancouver Open Data', datasetId: 'public-trees', recordId: '274379' },
    });
  });

  it('maps the community garden with its plot count', async () => {
    const [garden] = ofKind((await jonathanRogers()).features, 'garden');
    expect(garden).toMatchObject({
      attributes: { name: 'Elisabeth Rogers Community Garden', plots: 56 },
      suggestedLocked: true,
      provenance: { datasetId: 'community-gardens-and-food-trees', recordId: 'FA052' },
    });
  });
});

describe('VancouverOpenDataProvider queries', () => {
  it('filters records by the park polygon and asks only for the fields it uses', async () => {
    const calls: string[] = [];
    await jonathanRogers(withOverrides({}, calls));
    const trees = new URL(calls.find((url) => url.includes('public-trees')) ?? '');
    expect(trees.searchParams.get('where')).toMatch(
      /^within\(geo_point_2d, geom'POLYGON\(\(-123\.1093/,
    );
    expect(trees.searchParams.get('select')).not.toContain('e_mail');
    const park = new URL(calls[0] ?? '');
    expect(park.searchParams.get('where')).toBe('park_name="Jonathan Rogers Park"');
  });

  it('places special features at the parcel centre and marks the position approximate', async () => {
    const special = {
      total_count: 1,
      results: [{ parkid: 137, name: JONATHAN_ROGERS_PARK_NAME, specialfeature: 'Soccer Field' }],
    };
    const { features } = await jonathanRogers(withOverrides({ 'parks-special-features': special }));
    expect(ofKind(features, 'sportsField')[0]).toMatchObject({
      attributes: { name: 'Soccer Field', approximatePosition: true },
      provenance: { datasetId: 'parks-special-features' },
    });
  });
});

describe('VancouverOpenDataProvider paging', () => {
  it('pages through datasets with more records than one page holds', async () => {
    const calls: string[] = [];
    const tree = (id: number) => ({
      asset_id: id,
      common_name: 'PIN CHERRY',
      genus_name: 'PRUNUS',
      species_name: 'PENNSYLVANICA',
      diameter_cm: 10,
      height_m: 4.6,
      geo_point_2d: { lon: -123.108, lat: 49.2643 },
    });
    const pages: HttpFetch = (url, init) => {
      if (!url.includes('public-trees')) return withOverrides({}, calls)(url, init);
      calls.push(url);
      const offset = Number(new URL(url).searchParams.get('offset'));
      const results = Array.from({ length: offset === 0 ? 100 : 20 }, (_, i) => tree(offset + i));
      return Promise.resolve(Response.json({ total_count: 120, results }));
    };
    const trees = ofKind((await jonathanRogers(pages)).features, 'tree');
    expect(trees).toHaveLength(120);
    expect(calls.filter((url) => url.includes('public-trees'))).toHaveLength(2);
  });

  it('drops records the polygon filter let through that sit outside the parcel', async () => {
    const outside = {
      total_count: 1,
      results: [
        { mapid: 'X1', name: 'Far', number_of_plots: 3, geo_point_2d: { lon: -123.2, lat: 49.3 } },
      ],
    };
    const { features } = await jonathanRogers(
      withOverrides({ 'community-gardens-and-food-trees': outside }),
    );
    expect(ofKind(features, 'garden')).toHaveLength(0);
  });
});

describe('VancouverOpenDataProvider requests and errors', () => {
  it('uses the given polygon as the parcel when there is no park name', async () => {
    const provider = new VancouverOpenDataProvider({ fetch: recorded });
    const result = await provider.getFeatures({ polygonWgs84: JONATHAN_ROGERS_POLYGON });
    expect(result.ok && result.value.parcel.polygonWgs84).toEqual(JONATHAN_ROGERS_POLYGON);
  });

  it('reports a park the dataset does not know', async () => {
    const fetch = withOverrides({
      'parks-polygon-representation': { total_count: 0, results: [] },
    });
    const result = await new VancouverOpenDataProvider({ fetch }).getFeatures({
      parkName: 'Nowhere Park',
    });
    expect(result).toEqual({
      ok: false,
      error: { kind: 'parkNotFound', parkName: 'Nowhere Park' },
    });
  });

  it('refuses a park name that would break out of the query string', async () => {
    const result = await new VancouverOpenDataProvider({ fetch: recorded }).getFeatures({
      parkName: 'A" OR 1=1',
    });
    expect(!result.ok && result.error.kind).toBe('invalidRequest');
  });

  it('passes HTTP errors through', async () => {
    const fetch: HttpFetch = () => Promise.resolve(new Response('down', { status: 500 }));
    const result = await new VancouverOpenDataProvider({ fetch }).getFeatures({
      parkName: JONATHAN_ROGERS_PARK_NAME,
    });
    expect(!result.ok && result.error.kind).toBe('httpStatus');
  });

  it('passes errors from a later dataset through', async () => {
    const fetch = withOverrides({ 'public-trees': { results: 'bad' } });
    const result = await new VancouverOpenDataProvider({ fetch }).getFeatures({
      parkName: JONATHAN_ROGERS_PARK_NAME,
    });
    expect(!result.ok && result.error.kind).toBe('invalidResponse');
  });
});
