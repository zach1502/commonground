import { describe, expect, it } from 'vitest';

import { designDocumentSchema } from '@parkshape/core';

import { bareGround } from './bare-ground';

const SQUARE = [
  { x: 0, y: 0 },
  { x: 4, y: 0 },
  { x: 4, y: 4 },
  { x: 0, y: 4 },
];
const PARK = designDocumentSchema.parse({
  version: 1,
  items: [
    { id: 'i1', catalogId: 'bench', position: { x: 5, y: 5 }, rotationDeg: 0, locked: false },
  ],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 0 },
        { x: 9, y: 9 },
      ],
    },
  ],
  areas: [{ id: 'a1', catalogId: 'community-garden', polygon: SQUARE, locked: true }],
  gradeDelta: { cells: [{ x: 1, y: 1, deltaM: 0.5 }] },
  zones: [],
});

describe('bareGround', () => {
  it('leaves no item, path or area, so gardens go with the benches', () => {
    const bare = bareGround(PARK);
    expect(bare.items).toEqual([]);
    expect(bare.paths).toEqual([]);
    expect(bare.areas).toEqual([]);
  });

  it('keeps the ground shape the heatmap is draped over', () => {
    expect(bareGround(PARK).gradeDelta).toEqual(PARK.gradeDelta);
  });
});
