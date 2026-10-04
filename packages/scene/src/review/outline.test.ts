import { describe, expect, it } from 'vitest';

import { catalogIndex, itemIdSchema } from '@parkshape/core';

import { docOf, square } from '../editor/test-fixtures.js';

import { selectionOutline } from './outline.js';

const design = docOf({
  items: [
    {
      id: 'bench-1',
      catalogId: 'bench',
      position: { x: 10, y: 10 },
      rotationDeg: 0,
      locked: false,
    },
  ],
  paths: [
    {
      id: 'path-1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 40 },
        { x: 30, y: 40 },
      ],
    },
  ],
  areas: [{ id: 'lawn-1', catalogId: 'lawn', polygon: square(60, 60, 10), locked: false }],
});

const ref = (id: string, elementKind: 'item' | 'path' | 'area') => ({
  elementId: itemIdSchema.parse(id),
  elementKind,
});

describe('selectionOutline', () => {
  it('draws an item as its footprint and a ring, both closed', () => {
    const lines = selectionOutline(design, catalogIndex, ref('bench-1', 'item'));
    expect(lines).toHaveLength(2);
    expect(lines.every((line) => line.closed === 'closed')).toBe(true);
    expect(lines[0]?.points).toHaveLength(4);
  });

  it('draws a path along its points, open', () => {
    expect(selectionOutline(design, catalogIndex, ref('path-1', 'path'))).toEqual([
      { points: design.paths[0]?.points, closed: 'open' },
    ]);
  });

  it('draws an area around its polygon, closed', () => {
    expect(selectionOutline(design, catalogIndex, ref('lawn-1', 'area'))).toEqual([
      { points: design.areas[0]?.polygon, closed: 'closed' },
    ]);
  });

  it('draws nothing for an element the design does not have', () => {
    expect(selectionOutline(design, catalogIndex, ref('gone', 'item'))).toEqual([]);
  });
});
