import { describe, expect, it } from 'vitest';

import { designDocumentSchema } from '@parkshape/core';

import { digestDesign } from './design-digest.js';

const DOCUMENT = designDocumentSchema.parse({
  version: 1,
  items: [
    { id: 'i1', catalogId: 'douglas-fir', position: { x: 1, y: 1 }, rotationDeg: 0, locked: false },
    { id: 'i2', catalogId: 'garry-oak', position: { x: 2, y: 1 }, rotationDeg: 0, locked: false },
    { id: 'i3', catalogId: 'bench', position: { x: 3, y: 1 }, rotationDeg: 0, locked: false },
    {
      id: 'i4',
      catalogId: 'not-in-catalog',
      position: { x: 4, y: 1 },
      rotationDeg: 0,
      locked: false,
    },
  ],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
      ],
    },
  ],
  areas: [
    {
      id: 'a1',
      catalogId: 'pond',
      polygon: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 4, y: 4 },
      ],
      locked: false,
    },
  ],
  gradeDelta: { cells: [] },
  zones: [],
});

describe('digestDesign', () => {
  it('counts items, areas and paths by category and skips unknown catalog ids', () => {
    expect(digestDesign({ id: 'design-1', score: 0.5, document: DOCUMENT })).toEqual({
      id: 'design-1',
      score: 0.5,
      categoryCounts: { tree: 2, seating: 1, water: 1, path: 1 },
    });
  });

  it('leaves out the features that are in the park today, so a theme means a design added it', () => {
    const today = { position: { x: 9, y: 9 }, rotationDeg: 0, locked: true };
    const document = designDocumentSchema.parse({
      ...DOCUMENT,
      items: [
        ...DOCUMENT.items,
        { ...today, id: 'existing-overpass-way/1', catalogId: 'washroom-building' },
        { ...today, id: 'existing-public-trees-1', catalogId: 'garry-oak' },
      ],
    });
    const digest = digestDesign({ id: 'design-1', score: 0.5, document });
    expect(digest.categoryCounts.washroom).toBeUndefined();
    expect(digest.categoryCounts.tree).toBe(2);
  });
});
