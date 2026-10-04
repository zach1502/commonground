import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import { JONATHAN_ROGERS_POLYGON } from '../../ports/__contracts__/jonathan-rogers.js';
import type { HttpFetch } from '../../ports/http.js';

import { OsmOverpassProvider, overpassQuery } from './osm-overpass-provider.js';

const bodyText = (init: RequestInit | undefined): string =>
  typeof init?.body === 'string' ? init.body : '';

const RAW = new URL('../../../fixtures/jonathan-rogers/raw/overpass.json', import.meta.url);

function replay(calls: RequestInit[] = []): HttpFetch {
  return async (_url, init) => {
    calls.push(init ?? {});
    return new Response(await readFile(RAW, 'utf8'));
  };
}

const request = { polygonWgs84: JONATHAN_ROGERS_POLYGON };

describe('overpassQuery', () => {
  it('asks for allotments, gardens, pitches and buildings inside the polygon as lat lon pairs', () => {
    const query = overpassQuery(JONATHAN_ROGERS_POLYGON);
    expect(query).toContain(
      'way["landuse"="allotments"](poly:"49.264666151005976 -123.10930564309892',
    );
    expect(query).toContain('way["building"]');
    expect(query).toContain('way["leisure"="pitch"]');
    expect(query.startsWith('[out:json]')).toBe(true);
  });
});

describe('OsmOverpassProvider', () => {
  it('maps the recorded allotment to a garden polygon marked review only', async () => {
    const result = await new OsmOverpassProvider({ fetch: replay() }).getFeatures(request);
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    const garden = result.value.features.find((feature) => feature.kind === 'garden');
    expect(garden).toMatchObject({
      attributes: { name: 'Elisabeth Rogers Community Garden' },
      suggestedLocked: false,
      provenance: {
        source: 'OpenStreetMap',
        datasetId: 'overpass',
        recordId: 'way/118373967',
        licence: 'ODbL-1.0',
        reviewOnly: true,
      },
    });
    expect(garden && 'polygon' in garden && garden.polygon).toHaveLength(4);
  });

  it('maps the recorded field house to a building and the pitch to a sports field', async () => {
    const result = await new OsmOverpassProvider({ fetch: replay() }).getFeatures(request);
    const kinds = result.ok ? result.value.features.map((feature) => feature.kind) : [];
    expect(kinds.sort()).toEqual(['building', 'garden', 'sportsField']);
  });

  it('posts the query as a form with a user agent', async () => {
    const calls: RequestInit[] = [];
    await new OsmOverpassProvider({ fetch: replay(calls) }).getFeatures(request);
    expect(calls[0]?.method).toBe('POST');
    expect(bodyText(calls[0])).toMatch(/^data=/);
    expect(new Headers(calls[0]?.headers).get('user-agent')).toMatch(/CommonGround/);
  });
});

describe('OsmOverpassProvider filtering', () => {
  it('skips ways that are too short or sit outside the parcel', async () => {
    const elements = [
      {
        type: 'way',
        id: 1,
        tags: { building: 'yes' },
        geometry: [{ lat: 49.2644, lon: -123.108 }],
      },
      {
        type: 'way',
        id: 2,
        tags: { leisure: 'pitch' },
        geometry: [
          { lat: 49.3, lon: -123.2 },
          { lat: 49.3, lon: -123.19 },
          { lat: 49.31, lon: -123.19 },
        ],
      },
      { type: 'node', id: 3, tags: { building: 'yes' } },
    ];
    const fetch: HttpFetch = () => Promise.resolve(Response.json({ elements }));
    const result = await new OsmOverpassProvider({ fetch }).getFeatures(request);
    expect(result.ok && result.value.features).toEqual([]);
  });

  it('needs a polygon because Overpass has no park name lookup here', async () => {
    const result = await new OsmOverpassProvider({ fetch: replay() }).getFeatures({
      parkName: 'X',
    });
    expect(!result.ok && result.error.kind).toBe('invalidRequest');
  });
});
