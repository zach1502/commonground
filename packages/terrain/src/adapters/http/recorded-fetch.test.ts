import { describe, expect, it } from 'vitest';

import { GTFS_ZIP_URL, readGtfsStops } from '../translink/gtfs-stops.js';

import { recordedName, recordingFetch, replayFetch } from './recorded-fetch.js';

const VANCOUVER =
  'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-trees/records?limit=100';

describe('recordedName', () => {
  it('names Vancouver dataset responses by dataset id', () => {
    expect(recordedName(VANCOUVER)).toBe('vancouver-public-trees.json');
  });

  it('names Vancouver dataset exports by dataset id', () => {
    const exportUrl =
      'https://opendata.vancouver.ca/api/explore/v2.1/catalog/datasets/public-streets/exports/json?where=x';
    expect(recordedName(exportUrl)).toBe('vancouver-public-streets.json');
  });

  it('names the TransLink GTFS feed by its recorded stops', () => {
    expect(recordedName(GTFS_ZIP_URL)).toBe('translink-stops.json');
  });

  it('names STAC searches by collection', () => {
    const init = { method: 'POST', body: JSON.stringify({ collections: ['mrdem-30'] }) };
    expect(recordedName('https://datacube.services.geo.ca/stac/api/search', init)).toBe(
      'stac-mrdem-30.json',
    );
  });

  it('names Overpass queries', () => {
    expect(recordedName('https://overpass-api.de/api/interpreter')).toBe('overpass.json');
  });

  it('does not name COG range reads', () => {
    expect(
      recordedName('https://canelevation-dem.s3.ca-central-1.amazonaws.com/a-dtm.tif'),
    ).toBeUndefined();
  });
});

describe('replayFetch', () => {
  it('serves a recorded body and answers 404 for anything else', async () => {
    const fetch = replayFetch((name) =>
      Promise.resolve(name === 'overpass.json' ? '{"elements":[]}' : undefined),
    );
    const hit = await fetch('https://overpass-api.de/api/interpreter');
    expect(await hit.json()).toEqual({ elements: [] });
    expect((await fetch(VANCOUVER)).status).toBe(404);
  });
});

describe('replayFetch for GTFS', () => {
  it('rebuilds a zip from the recorded stops', async () => {
    const recorded = {
      url: GTFS_ZIP_URL,
      feedVersion: 'v1',
      feedStartDate: '20260907',
      stops: [
        { stop_id: '1', stop_code: '50001', stop_name: 'A @ B', stop_lat: 49.26, stop_lon: -123.1 },
      ],
    };
    const fetch = replayFetch((name) =>
      Promise.resolve(name === 'translink-stops.json' ? JSON.stringify(recorded) : undefined),
    );
    const response = await fetch(GTFS_ZIP_URL);
    const feed = readGtfsStops(new Uint8Array(await response.arrayBuffer()));
    expect(feed.ok && feed.value).toEqual({
      feedVersion: 'v1',
      feedStartDate: '20260907',
      stops: recorded.stops,
    });
  });
});

describe('recordingFetch', () => {
  it('passes the GTFS zip through without saving it', async () => {
    const saved: string[] = [];
    const upstream = () => Promise.resolve(new Response(new Uint8Array([80, 75, 3, 4])));
    const fetch = recordingFetch(upstream, (name) => {
      saved.push(name);
      return Promise.resolve();
    });
    const response = await fetch(GTFS_ZIP_URL);
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([80, 75, 3, 4]));
    expect(saved).toEqual([]);
  });

  it('saves named JSON responses and passes the body through', async () => {
    const saved = new Map<string, string>();
    const upstream = () => Promise.resolve(new Response('{"total_count":0,"results":[]}'));
    const fetch = recordingFetch(upstream, (name, text) => {
      saved.set(name, text);
      return Promise.resolve();
    });
    const response = await fetch(VANCOUVER);
    expect(await response.json()).toEqual({ total_count: 0, results: [] });
    expect(saved.get('vancouver-public-trees.json')).toContain('"total_count": 0');
  });

  it('passes unnamed responses through without saving', async () => {
    const saved: string[] = [];
    const upstream = () => Promise.resolve(new Response(new Uint8Array([1, 2]), { status: 206 }));
    const fetch = recordingFetch(upstream, (name) => {
      saved.push(name);
      return Promise.resolve();
    });
    const response = await fetch('https://cogs.test/x.tif');
    expect(response.status).toBe(206);
    expect(saved).toEqual([]);
  });
});
