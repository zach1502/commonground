import { describe, expect, it } from 'vitest';

import { catalogIndex } from '@parkshape/core';

import { docOf, square } from '../editor/test-fixtures.js';

import { reviewPickAt } from './review-pick.js';

const bench = {
  id: 'bench-1',
  catalogId: 'bench',
  position: { x: 10, y: 10 },
  rotationDeg: 0,
  locked: false,
};

const design = docOf({
  items: [bench, { ...bench, id: 'old-bench', position: { x: 30, y: 10 }, locked: true }],
  paths: [
    {
      id: 'path-1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 50, y: 0 },
        { x: 50, y: 30 },
      ],
    },
  ],
  areas: [
    { id: 'garden-1', catalogId: 'community-garden', polygon: square(70, 70, 10), locked: true },
  ],
});

describe('reviewPickAt', () => {
  it('selects an item under the tap, with no tap point', () => {
    expect(reviewPickAt({ point: { x: 10.2, y: 9.9 } }, design, catalogIndex)).toEqual({
      ref: { elementId: 'bench-1', elementKind: 'item' },
    });
  });

  it('selects a locked item too, since residents comment on what is there today', () => {
    expect(reviewPickAt({ point: { x: 30, y: 10 } }, design, catalogIndex)?.ref).toEqual({
      elementId: 'old-bench',
      elementKind: 'item',
    });
  });

  it('selects a path by its ribbon and keeps the tap point', () => {
    expect(reviewPickAt({ point: { x: 50.5, y: 12 } }, design, catalogIndex)).toEqual({
      ref: { elementId: 'path-1', elementKind: 'path' },
      surfacePoint: { x: 50.5, y: 12 },
    });
  });

  it('selects an area by its fill and keeps the tap point', () => {
    expect(reviewPickAt({ point: { x: 75, y: 72 } }, design, catalogIndex)).toEqual({
      ref: { elementId: 'garden-1', elementKind: 'area' },
      surfacePoint: { x: 75, y: 72 },
    });
  });

  it('prefers the item model the ray passed through over the ground under it', () => {
    const pick = reviewPickAt({ point: { x: 75, y: 72 }, aimed: 'bench-1' }, design, catalogIndex);
    expect(pick).toEqual({ ref: { elementId: 'bench-1', elementKind: 'item' } });
  });

  it('gives nothing for bare ground', () => {
    expect(reviewPickAt({ point: { x: 120, y: 120 } }, design, catalogIndex)).toBeUndefined();
  });
});
