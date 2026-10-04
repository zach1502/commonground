import { describe, expect, it } from 'vitest';

import { docOf, treeInput } from '../test-fixtures.js';

import { runAction } from './keys.js';
import { startPlacing } from './placing.js';
import { pointerSelect } from './selecting.js';
import { contextFor } from './test-context.js';

const doc = docOf({ items: [treeInput('t1', 10, 10)] });

describe('runAction', () => {
  it('deletes, undoes and redoes', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    runAction(ctx, 'delete');
    expect(ctx.store.getState().document.items).toHaveLength(0);
    runAction(ctx, 'undo');
    expect(ctx.store.getState().document.items).toHaveLength(1);
    runAction(ctx, 'redo');
    expect(ctx.store.getState().document.items).toHaveLength(0);
  });

  it('duplicates and rotates the selection', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    runAction(ctx, 'rotateIncrease');
    runAction(ctx, 'rotateDecrease');
    runAction(ctx, 'rotateDecrease');
    runAction(ctx, 'duplicate');
    const { items } = ctx.store.getState().document;
    expect(items).toHaveLength(2);
    expect(items[0]?.rotationDeg).toBe(345);
  });

  it('switches tools and toggles snap, the items list and the sheet', () => {
    const ctx = contextFor(doc);
    runAction(ctx, 'toolPath');
    expect(ctx.store.getState().tool).toMatchObject({ kind: 'path', surface: 'gravel' });
    runAction(ctx, 'toolArea');
    expect(ctx.store.getState().tool).toMatchObject({
      kind: 'area',
      catalogId: 'community-garden',
    });
    runAction(ctx, 'toolSelect');
    expect(ctx.store.getState().tool).toEqual({ kind: 'select' });
    runAction(ctx, 'toggleSnap');
    expect(ctx.store.getState().snap).toBe('off');
    runAction(ctx, 'toggleSnap');
    expect(ctx.store.getState().snap).toBe('on');
    runAction(ctx, 'itemsList');
    expect(ctx.store.getState().itemsList).toBe('shown');
    runAction(ctx, 'itemsList');
    expect(ctx.store.getState().itemsList).toBe('hidden');
    runAction(ctx, 'shortcuts');
    expect(ctx.store.getState().shortcuts).toBe('open');
    runAction(ctx, 'cancel');
    expect(ctx.store.getState().shortcuts).toBe('closed');
  });
});

describe('runAction while drawing', () => {
  it('finishes a path on Enter and uses Backspace for the last point while drawing', () => {
    const ctx = contextFor(doc);
    startPlacing(ctx, 'path-gravel');
    const { store } = ctx;
    store.getState().setTool({
      kind: 'path',
      surface: 'gravel',
      draft: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
        { x: 8, y: 0 },
      ],
    });
    runAction(ctx, 'backspace');
    expect(store.getState().tool).toMatchObject({
      draft: [
        { x: 0, y: 0 },
        { x: 4, y: 0 },
      ],
    });
    runAction(ctx, 'finish');
    expect(store.getState().document.paths).toHaveLength(1);
  });

  it('deletes the selection on Backspace when no path is being drawn', () => {
    const ctx = contextFor(doc);
    pointerSelect(ctx, { x: 10, y: 10 }, 'replace');
    runAction(ctx, 'backspace');
    runAction(ctx, 'finish');
    expect(ctx.store.getState().document.items).toHaveLength(0);
  });
});
