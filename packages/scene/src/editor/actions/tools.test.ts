import { describe, expect, it } from 'vitest';

import { docOf } from '../test-fixtures.js';

import {
  addCornerAt,
  beginAddCorner,
  beginArea,
  dragAreaTo,
  finishArea,
  moveAreaCorner,
  moveAreaEdge,
  selectedAreaSummary,
} from './areas.js';
import {
  addPathPoint,
  finishPathDraft,
  insertPathMidpoint,
  movePathVertexTo,
  removePathPoint,
} from './paths.js';
import { startPlacing } from './placing.js';
import { contextFor } from './test-context.js';

describe('path tool', () => {
  it('draws a three-point path from snapped clicks and finishes it', () => {
    const ctx = contextFor(docOf());
    startPlacing(ctx, 'path-gravel');
    expect(ctx.store.getState().hints.path).toBe('pending');
    addPathPoint(ctx, { x: 1.1, y: 1.2 });
    addPathPoint(ctx, { x: 10.3, y: 1 });
    addPathPoint(ctx, { x: 10, y: 9.8 });
    expect(finishPathDraft(ctx)).toBe('finished');
    const [path] = ctx.store.getState().document.paths;
    expect(path?.points).toEqual([
      { x: 1, y: 1 },
      { x: 10.5, y: 1 },
      { x: 10, y: 10 },
    ]);
    expect(path).toMatchObject({ surface: 'gravel', widthM: 2 });
    expect(ctx.store.getState().tool).toMatchObject({ kind: 'path', draft: [] });
    expect(ctx.store.getState().hints.path).toBe('dismissed');
  });

  it('removes the last point with Backspace and refuses a one-point path', () => {
    const ctx = contextFor(docOf());
    startPlacing(ctx, 'path-gravel');
    addPathPoint(ctx, { x: 1, y: 1 });
    addPathPoint(ctx, { x: 5, y: 1 });
    removePathPoint(ctx);
    expect(ctx.store.getState().tool).toMatchObject({ draft: [{ x: 1, y: 1 }] });
    expect(finishPathDraft(ctx)).toBe('too-short');
    expect(ctx.store.getState().notice).toEqual({ kind: 'path-too-short' });
  });

  it('ignores path actions in other tools', () => {
    const ctx = contextFor(docOf());
    addPathPoint(ctx, { x: 1, y: 1 });
    removePathPoint(ctx);
    expect(finishPathDraft(ctx)).toBe('too-short');
    expect(ctx.store.getState().tool).toEqual({ kind: 'select' });
  });

  it('moves a vertex and adds one at a midpoint', () => {
    const ctx = contextFor(docOf());
    startPlacing(ctx, 'path-gravel');
    addPathPoint(ctx, { x: 0, y: 0 });
    addPathPoint(ctx, { x: 10, y: 0 });
    finishPathDraft(ctx);
    const id = ctx.store.getState().document.paths[0]?.id ?? '';
    movePathVertexTo(ctx, id, 1, { x: 10.2, y: 4.1 });
    insertPathMidpoint(ctx, id, 0);
    expect(ctx.store.getState().document.paths[0]?.points).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 2 },
      { x: 10, y: 4 },
    ]);
    movePathVertexTo(ctx, 'missing', 0, { x: 1, y: 1 });
    insertPathMidpoint(ctx, id, 9);
    expect(ctx.store.getState().history.past).toHaveLength(3);
  });
});

describe('area tool', () => {
  it('drags a rectangle, reports its plots and adds it', () => {
    const ctx = contextFor(docOf());
    startPlacing(ctx, 'community-garden');
    beginArea(ctx, { x: 10, y: 10 });
    dragAreaTo(ctx, { x: 22.4, y: 21.4 });
    expect(selectedAreaSummary(ctx.store.getState(), ctx.catalog)).toMatchObject({
      areaM2: 12.5 * 11.5,
      plots: 18,
    });
    expect(finishArea(ctx)).toBe('added');
    const [area] = ctx.store.getState().document.areas;
    expect(area?.polygon[2]).toEqual({ x: 22.5, y: 21.5 });
    expect(ctx.store.getState().selection).toEqual([{ kind: 'area', id: area?.id }]);
    expect(selectedAreaSummary(ctx.store.getState(), ctx.catalog)?.plots).toBe(18);
  });

  it('refuses an area below the catalog minimum and says so', () => {
    const ctx = contextFor(docOf());
    startPlacing(ctx, 'community-garden');
    beginArea(ctx, { x: 10, y: 10 });
    dragAreaTo(ctx, { x: 13, y: 13 });
    expect(finishArea(ctx)).toBe('too-small');
    expect(ctx.store.getState().notice).toEqual({ kind: 'area-too-small', minAreaM2: 40 });
    expect(ctx.store.getState().document.areas).toHaveLength(0);
  });

  it('ignores area actions outside the tool and without a draft', () => {
    const ctx = contextFor(docOf());
    dragAreaTo(ctx, { x: 1, y: 1 });
    expect(finishArea(ctx)).toBe('none');
    expect(selectedAreaSummary(ctx.store.getState(), ctx.catalog)).toBeNull();
  });

  it('moves a corner and an edge, and adds a corner on the nearest edge', () => {
    const ctx = contextFor(docOf());
    startPlacing(ctx, 'community-garden');
    beginArea(ctx, { x: 0, y: 0 });
    dragAreaTo(ctx, { x: 10, y: 10 });
    finishArea(ctx);
    const id = ctx.store.getState().document.areas[0]?.id ?? '';
    moveAreaCorner(ctx, id, 2, { x: 12.2, y: 10 });
    moveAreaEdge(ctx, id, 3, { x: -1.9, y: 0 });
    beginAddCorner(ctx, id);
    expect(ctx.store.getState().tool).toEqual({ kind: 'add-corner', areaId: id });
    addCornerAt(ctx, { x: 5, y: -2 });
    const polygon = ctx.store.getState().document.areas[0]?.polygon;
    expect(polygon).toEqual([
      { x: -2, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
      { x: 12, y: 10 },
      { x: -2, y: 10 },
    ]);
    expect(ctx.store.getState().tool).toEqual({ kind: 'select' });
    ctx.store.getState().undo();
    expect(ctx.store.getState().document.areas[0]?.polygon).toHaveLength(4);
  });
});
