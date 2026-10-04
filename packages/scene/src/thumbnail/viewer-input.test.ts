import { describe, expect, it } from 'vitest';

import { catalogItems, designDocumentSchema, parcelSchema } from '@parkshape/core';

import { viewerCatalog, viewerScene } from './viewer-input.js';

const parcel = parcelSchema.parse({
  id: 'jrp',
  name: 'Jonathan Rogers Park',
  polygon: [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 120 },
    { x: 0, y: 120 },
  ],
  origin: { lat: 49.26, lon: -123.09 },
});

const blank = designDocumentSchema.parse({
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});

describe('viewerCatalog', () => {
  it('maps every catalog item to a viewer category', () => {
    expect(viewerCatalog).toHaveLength(catalogItems.length);
    const categories = new Set(viewerCatalog.map((item) => item.category));
    for (const category of categories) {
      expect(['tree', 'shrub', 'building', 'bench', 'play', 'other']).toContain(category);
    }
  });

  it('keeps the model key so the viewer draws the right model', () => {
    const first = viewerCatalog[0];
    const source = catalogItems.find((item) => item.id === first?.id);
    expect(first?.modelKey).toBe(source?.modelKey);
  });
});

describe('viewerScene', () => {
  it('builds a heightmap sized to the parcel and an empty viewer document', () => {
    const scene = viewerScene(blank, parcel);
    expect(scene.heightmap.width).toBeGreaterThan(0);
    expect(scene.document.items).toEqual([]);
    expect(scene.catalog).toBe(viewerCatalog);
  });

  it('draws on the recorded terrain when one is given, as the hero does', () => {
    const terrain = {
      width: 2,
      height: 2,
      resolutionM: 1,
      originLocal: { x: 0, y: 0 },
      elevations: new Float32Array([1, 2, 3, 4]),
    };
    expect(viewerScene(blank, parcel, terrain).heightmap).toBe(terrain);
  });

  it('keeps the baseline paths in the viewer document', () => {
    const withPath = designDocumentSchema.parse({
      ...blank,
      paths: [
        {
          id: 'north-edge',
          surface: 'gravel',
          widthM: 2,
          points: [
            { x: 5, y: 110 },
            { x: 115, y: 110 },
          ],
        },
      ],
    });
    expect(viewerScene(withPath, parcel).document.paths).toHaveLength(1);
  });
});

describe('viewerScene for the live views', () => {
  it('gives the live viewer the baseline paths on the recorded terrain, as the stills get', () => {
    const terrain = {
      width: 2,
      height: 2,
      resolutionM: 60,
      originLocal: { x: 0, y: 0 },
      elevations: new Float32Array([0, 0, 20, 20]),
    };
    const baseline = designDocumentSchema.parse({
      ...blank,
      paths: [
        {
          id: 'north-bank',
          surface: 'gravel',
          widthM: 2,
          points: [
            { x: 5, y: 110 },
            { x: 115, y: 110 },
          ],
        },
      ],
    });
    const live = viewerScene(baseline, parcel, terrain);
    expect(live.heightmap).toBe(terrain);
    expect(live.document.paths.map((path) => path.id)).toEqual(['north-bank']);
  });
});

describe('viewerScene ground', () => {
  it('cuts the ground to a triangular parcel', () => {
    const triangle = parcelSchema.parse({
      ...parcel,
      polygon: [
        { x: 0, y: 0 },
        { x: 120, y: 0 },
        { x: 0, y: 120 },
      ],
    });
    expect(viewerScene(blank, triangle).heightmap.groundOutline).toEqual(triangle.polygon);
  });

  it('keeps a rectangular parcel as the whole grid box', () => {
    expect(viewerScene(blank, parcel).heightmap.groundOutline).toBeUndefined();
  });
});
