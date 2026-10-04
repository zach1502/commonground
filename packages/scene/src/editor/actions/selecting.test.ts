import { describe, expect, it } from 'vitest';

import { docOf, square, treeInput } from '../test-fixtures.js';

import {
  commitDrag,
  deleteSelection,
  dragSelection,
  duplicateSelection,
  marqueeSelect,
  nudgeSelection,
  pointerSelect,
  previewDocument,
  rotateSelection,
  setItemPosition,
  setItemRotation,
} from './selecting.js';
import { contextFor } from './test-context.js';

const doc = docOf({
  items: [treeInput('t1', 10, 10), treeInput('t2', 20, 10), treeInput('old', 40, 40, 'locked')],
  paths: [
    {
      id: 'p1',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 0, y: 30 },
        { x: 10, y: 30 },
      ],
    },
  ],
  areas: [{ id: 'a1', catalogId: 'community-garden', polygon: square(20, 20, 8), locked: false }],
});

describe('pointerSelect', () => {
  it('selects the item under the pointer and adds with shift', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    pointerSelect(ctx, { x: 20, y: 10 }, 'add');
    expect(ctx.store.getState().selection.map((ref) => ref.id)).toEqual(['t1', 't2']);
  });

  it('shows the lock notice instead of selecting a locked item', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 40, y: 40 }, 'replace');
    expect(ctx.store.getState().selection).toEqual([]);
    expect(ctx.store.getState().notice).toEqual({ kind: 'locked', id: 'old' });
  });

  it('clears the selection on empty ground', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    pointerSelect(ctx, { x: 50, y: 5 }, 'replace');
    expect(ctx.store.getState().selection).toEqual([]);
  });
});

describe('marqueeSelect', () => {
  it('selects everything unlocked in the box', () => {
    const ctx = contextFor(doc);
    marqueeSelect(ctx, { from: { x: 0, y: 0 }, to: { x: 50, y: 50 } }, 'replace');
    expect(ctx.store.getState().selection.map((ref) => ref.id)).toEqual(['t1', 't2', 'p1', 'a1']);
  });
});

describe('dragging', () => {
  it('previews the move and commits it as one undo step, snapped to the grid', () => {
    const ctx = contextFor(doc);
    marqueeSelect(ctx, { from: { x: 0, y: 0 }, to: { x: 50, y: 50 } }, 'replace');
    dragSelection(ctx, { grab: { x: 10, y: 10 }, pointer: { x: 13.2, y: 11.1 } });
    expect(ctx.store.getState().drag).toEqual({ x: 3, y: 1 });
    const preview = previewDocument(ctx.store.getState());
    expect(preview.items[0]?.position).toEqual({ x: 13, y: 11 });
    expect(ctx.store.getState().document).toEqual(doc);
    commitDrag(ctx);
    const moved = ctx.store.getState().document;
    expect(moved.items.map((item) => item.position)).toEqual([
      { x: 13, y: 11 },
      { x: 23, y: 11 },
      { x: 40, y: 40 },
    ]);
    expect(moved.paths[0]?.points[0]).toEqual({ x: 3, y: 31 });
    expect(moved.areas[0]?.polygon[0]).toEqual({ x: 23, y: 21 });
    ctx.store.getState().undo();
    expect(ctx.store.getState().document).toEqual(doc);
  });

  it('commits nothing for a drag that did not move', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    dragSelection(ctx, { grab: { x: 10, y: 10 }, pointer: { x: 10.1, y: 10 } });
    commitDrag(ctx);
    expect(ctx.store.getState().history.past).toHaveLength(0);
    expect(previewDocument(ctx.store.getState())).toBe(ctx.store.getState().document);
  });
});

describe('toolbar actions', () => {
  it('rotates selected items by a step', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    rotateSelection(ctx, 'increase');
    rotateSelection(ctx, 'increase');
    expect(ctx.store.getState().document.items[0]?.rotationDeg).toBe(30);
    rotateSelection(ctx, 'decrease');
    expect(ctx.store.getState().document.items[0]?.rotationDeg).toBe(15);
  });

  it('duplicates the selection 1 m away and selects the copies', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    duplicateSelection(ctx);
    const { document, selection } = ctx.store.getState();
    expect(document.items).toHaveLength(4);
    expect(document.items[3]?.position).toEqual({ x: 11, y: 9 });
    expect(selection).toEqual([{ kind: 'item', id: document.items[3]?.id }]);
  });

  it('deletes every selected element in one undo step', () => {
    const ctx = contextFor(doc);
    marqueeSelect(ctx, { from: { x: 0, y: 0 }, to: { x: 50, y: 50 } }, 'replace');
    deleteSelection(ctx);
    const { document } = ctx.store.getState();
    expect(document.items.map((item) => item.id)).toEqual(['old']);
    expect(document.paths).toHaveLength(0);
    expect(document.areas).toHaveLength(0);
    ctx.store.getState().undo();
    expect(ctx.store.getState().document).toEqual(doc);
  });

  it('nudges the selection by an exact amount', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 20, y: 10 }, 'replace');
    nudgeSelection(ctx, { x: 0, y: 0.5 });
    expect(ctx.store.getState().document.items[1]?.position).toEqual({ x: 20, y: 10.5 });
  });

  it('does nothing with an empty selection', () => {
    const ctx = contextFor(doc);
    rotateSelection(ctx, 'increase');
    duplicateSelection(ctx);
    deleteSelection(ctx);
    nudgeSelection(ctx, { x: 1, y: 0 });
    expect(ctx.store.getState().history.past).toHaveLength(0);
  });
});

describe('properties panel', () => {
  it('sets an exact position and rotation', () => {
    const ctx = contextFor(doc);
    setItemPosition(ctx, 't1', { x: 12.25, y: 8 });
    setItemRotation(ctx, 't1', 370);
    const item = ctx.store.getState().document.items[0];
    expect(item?.position).toEqual({ x: 12.25, y: 8 });
    expect(item?.rotationDeg).toBe(10);
  });

  it('leaves locked or unknown items alone', () => {
    const ctx = contextFor(doc);
    setItemPosition(ctx, 'old', { x: 1, y: 1 });
    setItemRotation(ctx, 'nope', 90);
    expect(ctx.store.getState().history.past).toHaveLength(0);
  });
});
