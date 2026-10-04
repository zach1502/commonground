import { describe, expect, it } from 'vitest';

import { catalogIndex } from '@parkshape/core';

import { elementAt, marqueeHits, selectableRefs } from './selection.js';
import { docOf, square, treeInput } from './test-fixtures.js';

const doc = docOf({
  items: [treeInput('t1', 10, 10), treeInput('t2', 20, 20), treeInput('old', 12, 12, 'locked')],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 50, y: 0 },
        { x: 50, y: 30 },
      ],
    },
  ],
  areas: [
    { id: 'a1', catalogId: 'community-garden', polygon: square(70, 70, 10), locked: false },
    { id: 'a2', catalogId: 'community-garden', polygon: square(90, 90, 5), locked: true },
  ],
});

describe('marqueeHits', () => {
  it('selects unlocked items whose centre is inside the box, dragged either way', () => {
    const forward = marqueeHits({ from: { x: 5, y: 5 }, to: { x: 15, y: 15 } }, doc);
    const backward = marqueeHits({ from: { x: 15, y: 15 }, to: { x: 5, y: 5 } }, doc);
    expect(forward).toEqual([{ kind: 'item', id: 't1' }]);
    expect(backward).toEqual(forward);
  });

  it('includes paths and areas that sit wholly inside the box', () => {
    const hits = marqueeHits({ from: { x: 0, y: 0 }, to: { x: 85, y: 85 } }, doc);
    expect(hits).toEqual([
      { kind: 'item', id: 't1' },
      { kind: 'item', id: 't2' },
      { kind: 'path', id: 'p1' },
      { kind: 'area', id: 'a1' },
    ]);
  });

  it('never selects locked elements', () => {
    const hits = marqueeHits({ from: { x: 0, y: 0 }, to: { x: 100, y: 100 } }, doc);
    expect(hits.map((hit) => hit.id)).not.toContain('old');
    expect(hits.map((hit) => hit.id)).not.toContain('a2');
  });
});

describe('elementAt', () => {
  it('finds the item whose footprint is under the point', () => {
    expect(elementAt({ x: 10.2, y: 9.9 }, doc, catalogIndex)).toEqual({ kind: 'item', id: 't1' });
  });

  it('reports a locked item as locked so the editor can show its badge', () => {
    expect(elementAt({ x: 12, y: 12 }, doc, catalogIndex)).toEqual({
      kind: 'item',
      id: 'old',
      locked: 'locked',
    });
  });

  it('finds a path within half its width, then an area under the point', () => {
    expect(elementAt({ x: 50.8, y: 15 }, doc, catalogIndex)).toEqual({ kind: 'path', id: 'p1' });
    expect(elementAt({ x: 75, y: 75 }, doc, catalogIndex)).toEqual({ kind: 'area', id: 'a1' });
  });

  it('returns null on empty ground', () => {
    expect(elementAt({ x: 30, y: 60 }, doc, catalogIndex)).toBeNull();
  });
});

describe('selectableRefs', () => {
  it('drops locked and unknown elements', () => {
    const refs = selectableRefs(doc, [
      { kind: 'item', id: 't1' },
      { kind: 'item', id: 'old' },
      { kind: 'area', id: 'a2' },
      { kind: 'item', id: 'ghost' },
      { kind: 'path', id: 'p1' },
    ]);
    expect(refs).toEqual([
      { kind: 'item', id: 't1' },
      { kind: 'path', id: 'p1' },
    ]);
  });
});
