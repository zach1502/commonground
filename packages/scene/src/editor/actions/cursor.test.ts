import { describe, expect, it } from 'vitest';

import { docOf, treeInput } from '../test-fixtures.js';

import { cursorForTool } from './cursor.js';
import { contextFor } from './test-context.js';

const contextWithTree = () => contextFor(docOf({ items: [treeInput('t1', 10, 10)] }));

describe('cursorForTool', () => {
  it('points by default in the select tool', () => {
    expect(cursorForTool(contextWithTree().store.getState())).toBe('default');
  });

  it('shows a pointer when an item reads as selectable under the cursor', () => {
    const ctx = contextWithTree();
    ctx.store.getState().setHovered('t1');
    expect(cursorForTool(ctx.store.getState())).toBe('pointer');
  });

  it('crosshairs in a drawing tool', () => {
    const ctx = contextWithTree();
    ctx.store.getState().setTool({ kind: 'place', catalogId: 'bench' });
    expect(cursorForTool(ctx.store.getState())).toBe('crosshair');
    ctx.store.getState().setTool({ kind: 'path', surface: 'gravel', draft: [] });
    expect(cursorForTool(ctx.store.getState())).toBe('crosshair');
    ctx.store.getState().setTool({ kind: 'area', catalogId: 'community-garden', draft: null });
    expect(cursorForTool(ctx.store.getState())).toBe('crosshair');
  });

  it('paints in the terraform tool', () => {
    const ctx = contextWithTree();
    ctx.store.getState().setTool({ kind: 'terraform' });
    expect(cursorForTool(ctx.store.getState())).toBe('cell');
  });

  it('grabs while a selection is dragged', () => {
    const ctx = contextWithTree();
    ctx.store.getState().setDrag({ x: 1, y: 0 });
    expect(cursorForTool(ctx.store.getState())).toBe('grabbing');
  });
});
