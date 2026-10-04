import { readFile } from 'node:fs/promises';

import { describe } from 'vitest';

import { CONTEXT_BUFFER_M, FakeClock, contextFeatureSchema } from '@parkshape/core';

import {
  JONATHAN_ROGERS_PARK_NAME,
  JONATHAN_ROGERS_POLYGON,
} from '../ports/__contracts__/jonathan-rogers.js';
import { siteContextProviderContract } from '../ports/__contracts__/site-context-provider.contract.js';
import { siteFeaturesProviderContract } from '../ports/__contracts__/site-features-provider.contract.js';
import { terrainProviderContract } from '../ports/__contracts__/terrain-provider.contract.js';
import type { HttpFetch } from '../ports/http.js';
import type { SiteContextProvider } from '../ports/site-context-provider.js';
import type { SiteFeaturesProvider } from '../ports/site-features-provider.js';
import type { TerrainProvider } from '../ports/terrain-provider.js';

import { ChainProvider } from './chain/chain-provider.js';
import { makeSyntheticCog, serveRanges } from './cog/__contracts__/synthetic-cog.js';
import { HrdemCogProvider, MrdemProvider } from './cog/cog-terrain-providers.js';
import { replayFetch } from './http/recorded-fetch.js';
import { InMemorySiteContextProvider } from './memory/in-memory-site-context-provider.js';
import { OsmOverpassProvider } from './osm/osm-overpass-provider.js';
import { StaticHeightmapProvider } from './static/static-heightmap-provider.js';
import { StaticSiteContextProvider } from './static/static-site-context-provider.js';
import { StaticSiteFeaturesProvider } from './static/static-site-features-provider.js';
import { VancouverContextProvider } from './vancouver/vancouver-context-provider.js';
import { VancouverOpenDataProvider } from './vancouver/vancouver-open-data-provider.js';

const RAW = new URL('../../fixtures/jonathan-rogers/raw/', import.meta.url);
const recorded = replayFetch(async (name) =>
  readFile(new URL(name, RAW), 'utf8').catch(() => undefined),
);
// The DTM hrefs in the recorded STAC responses; tests serve a synthetic COG at each one.
const HRDEM_DTM =
  'https://canelevation-dem.s3.ca-central-1.amazonaws.com/hrdem-mosaic-1m/2_3-mosaic-1m-dtm.tif';
const MRDEM_DTM =
  'https://canelevation-dem.s3.ca-central-1.amazonaws.com/mrdem-30/mrdem-30-dtm.tif';

function cogAt(url: string, pixelSizeM: number): HttpFetch {
  const cog = makeSyntheticCog({ polygonWgs84: JONATHAN_ROGERS_POLYGON, pixelSizeM });
  return serveRanges({ url, bytes: cog.bytes }, recorded).fetch;
}

const terrainAdapters: [string, () => TerrainProvider][] = [
  ['StaticHeightmapProvider', () => new StaticHeightmapProvider()],
  ['HrdemCogProvider', () => new HrdemCogProvider({ fetch: cogAt(HRDEM_DTM, 1) })],
  ['MrdemProvider', () => new MrdemProvider({ fetch: cogAt(MRDEM_DTM, 30) })],
  [
    'ChainProvider',
    // HRDEM has no recorded COG here, so the chain has to fall through to MRDEM.
    () =>
      new ChainProvider([
        new HrdemCogProvider({ fetch: recorded }),
        new MrdemProvider({ fetch: cogAt(MRDEM_DTM, 30) }),
      ]),
  ],
];

const siteAdapters: [string, () => SiteFeaturesProvider, object][] = [
  [
    'StaticSiteFeaturesProvider',
    () => new StaticSiteFeaturesProvider(),
    { parkName: JONATHAN_ROGERS_PARK_NAME },
  ],
  [
    'VancouverOpenDataProvider',
    () => new VancouverOpenDataProvider({ fetch: recorded }),
    { parkName: JONATHAN_ROGERS_PARK_NAME },
  ],
  [
    'OsmOverpassProvider',
    () => new OsmOverpassProvider({ fetch: recorded }),
    { polygonWgs84: JONATHAN_ROGERS_POLYGON },
  ],
];

describe.each(terrainAdapters)('%s', (name, makeProvider) => {
  terrainProviderContract(name, makeProvider, {
    polygonWgs84: JONATHAN_ROGERS_POLYGON,
    resolutionM: 1,
  });
});

describe.each(siteAdapters)('%s', (name, makeProvider, request) => {
  siteFeaturesProviderContract(name, makeProvider, request);
});

// Out of order on purpose, so the contract sees the adapter sort them.
const contextFeatures = [
  {
    id: 'stop-50001',
    kind: 'busStop',
    name: 'Westbound W Broadway @ Columbia St',
    source: { name: 'Vancouver Open Data', datasetId: 'stops' },
    geometry: { type: 'point', position: { x: 40, y: -150 } },
  },
  {
    id: 'street-w-7th',
    kind: 'street',
    name: 'W 7th Ave',
    source: { name: 'Vancouver Open Data', datasetId: 'public-streets' },
    geometry: {
      type: 'line',
      points: [
        { x: -20, y: 96 },
        { x: 196, y: 96 },
      ],
      widthM: 8,
    },
  },
  {
    id: 'parking-1',
    kind: 'parking',
    source: { name: 'Vancouver Open Data', datasetId: 'parking-meters' },
    geometry: {
      type: 'polygon',
      ring: [
        { x: 10, y: -8 },
        { x: 16, y: -8 },
        { x: 16, y: -5.6 },
        { x: 10, y: -5.6 },
      ],
    },
  },
].map((feature) => contextFeatureSchema.parse(feature));

const contextRequest = { polygonWgs84: JONATHAN_ROGERS_POLYGON, bufferM: CONTEXT_BUFFER_M };
// About 4 km east of the park, far past the recorded 300 m.
const EAST_SHIFT_DEG = 0.05;
const uncovered = {
  bufferM: CONTEXT_BUFFER_M,
  polygonWgs84: {
    type: 'Polygon' as const,
    coordinates: JONATHAN_ROGERS_POLYGON.coordinates.map((ring) =>
      ring.map(([lon, lat]) => [lon + EAST_SHIFT_DEG, lat] as const),
    ),
  },
};
const recordedClock = new FakeClock(new Date('2026-10-03T16:30:00.000Z'));

const contextAdapters: [string, () => SiteContextProvider, { uncovered?: typeof uncovered }][] = [
  [
    'InMemorySiteContextProvider',
    () =>
      new InMemorySiteContextProvider({
        features: contextFeatures,
        recordedAt: '2026-10-03T12:00:00.000Z',
      }),
    {},
  ],
  ['StaticSiteContextProvider', () => new StaticSiteContextProvider(), { uncovered }],
  [
    'VancouverContextProvider',
    () => new VancouverContextProvider({ fetch: recorded, clock: recordedClock }),
    { uncovered },
  ],
];

describe.each(contextAdapters)('%s', (name, makeProvider, options) => {
  siteContextProviderContract(name, makeProvider, contextRequest, options);
});
