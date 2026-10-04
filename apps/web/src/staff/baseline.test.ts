import { describe, expect, it } from 'vitest';

import type { ProposedFeature } from '../api/staff-api';

import { defaultLocks, placeableFeatures, proposedBaseline, withoutZones } from './baseline';

function feature(overrides: Partial<ProposedFeature>): ProposedFeature {
  return {
    id: 'public-trees-1',
    kind: 'tree',
    catalogId: 'western-red-cedar',
    name: 'Western red cedar',
    dbhCm: 48.3,
    plots: null,
    suggestedLocked: true,
    source: 'Vancouver Open Data',
    datasetId: 'public-trees',
    reviewOnly: false,
    position: { x: 10, y: 12 },
    polygon: null,
    lonLat: [-123.108, 49.264],
    ...overrides,
  };
}

const SQUARE = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
  { x: 0, y: 10 },
];

const CEDAR = feature({});
const PLUM = feature({
  id: 'public-trees-2',
  catalogId: null,
  name: 'Pissard plum',
  dbhCm: 12,
  suggestedLocked: false,
});
const GARDEN = feature({
  id: 'overpass-garden',
  kind: 'garden',
  catalogId: null,
  source: 'OpenStreetMap',
  datasetId: 'overpass',
  position: null,
  polygon: SQUARE,
  suggestedLocked: false,
});
const POINT_GARDEN = feature({ id: 'gardens-1', kind: 'garden', catalogId: null, dbhCm: null });
const BUILDING = feature({
  id: 'overpass-house',
  kind: 'building',
  position: null,
  polygon: SQUARE,
});

describe('defaultLocks', () => {
  it('starts each feature at the lock the source suggests', () => {
    expect(defaultLocks([CEDAR, PLUM])).toEqual({
      'public-trees-1': 'locked',
      'public-trees-2': 'unlocked',
    });
  });
});

describe('placeableFeatures', () => {
  it('leaves out features the editor cannot draw, such as a garden known only by its point', () => {
    expect(placeableFeatures([CEDAR, POINT_GARDEN, GARDEN]).map((entry) => entry.id)).toEqual([
      'public-trees-1',
      'overpass-garden',
    ]);
  });
});

describe('proposedBaseline', () => {
  it('turns trees into items with their measured trunk and chosen lock', () => {
    const doc = proposedBaseline([CEDAR, PLUM], { 'public-trees-1': 'locked' });
    expect(doc.items).toEqual([
      {
        id: 'existing-public-trees-1',
        catalogId: 'western-red-cedar',
        position: { x: 10, y: 12 },
        rotationDeg: 0,
        locked: true,
        dbhCm: 48.3,
      },
      expect.objectContaining({ catalogId: 'flowering-cherry', locked: false, dbhCm: 12 }),
    ]);
  });

  it('turns outlines into existing areas and buildings into an item at their centre', () => {
    const doc = proposedBaseline([GARDEN, BUILDING], {});
    expect(doc.areas).toEqual([
      {
        id: 'existing-overpass-garden',
        catalogId: 'community-garden',
        polygon: SQUARE,
        locked: false,
        existing: true,
      },
    ]);
    expect(doc.items[0]).toMatchObject({
      catalogId: 'washroom-building',
      position: { x: 5, y: 5 },
    });
  });

  it('keeps the plot count the site record gives on a garden outline', () => {
    const doc = proposedBaseline([{ ...GARDEN, plots: 56 }], {});
    expect(doc.areas[0]).toMatchObject({ catalogId: 'community-garden', recordedPlots: 56 });
  });

  it('gives a garden outline with no record no plot count', () => {
    expect(proposedBaseline([GARDEN], {}).areas[0]).not.toHaveProperty('recordedPlots');
  });

  it('builds an empty baseline from no features', () => {
    expect(proposedBaseline([], {})).toEqual({
      version: 1,
      items: [],
      paths: [],
      areas: [],
      gradeDelta: { cells: [] },
      zones: [],
    });
  });
});

describe('withoutZones', () => {
  it('moves drawn zones out of the baseline so they become project zones', () => {
    const doc = proposedBaseline([], {});
    const zone = { id: 'zone-1', kind: 'forbidden', polygon: SQUARE.slice(0, 3), label: 'Zone 1' };
    const split = withoutZones({ ...doc, zones: [zone] } as never);
    expect(split.document.zones).toEqual([]);
    expect(split.zones).toHaveLength(1);
  });
});
