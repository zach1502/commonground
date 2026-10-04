import { describe, expect, it } from 'vitest';

import { docOf, treeInput } from '../test-fixtures.js';

import { cancelTool, hoverPlacement, placeAtPoint, startPlacing } from './placing.js';
import { contextFor } from './test-context.js';

const lockedOak = docOf({ items: [treeInput('old-oak', 10, 10, 'locked')] });

describe('startPlacing', () => {
  it('picks the tool that fits the catalog entry', () => {
    const ctx = contextFor(lockedOak);
    startPlacing(ctx, 'bench');
    expect(ctx.store.getState().tool).toEqual({ kind: 'place', catalogId: 'bench' });
    startPlacing(ctx, 'community-garden');
    expect(ctx.store.getState().tool).toMatchObject({
      kind: 'area',
      catalogId: 'community-garden',
    });
    startPlacing(ctx, 'path-boardwalk');
    expect(ctx.store.getState().tool).toMatchObject({ kind: 'path', surface: 'boardwalk' });
    startPlacing(ctx, 'no-such-thing');
    expect(ctx.store.getState().tool).toMatchObject({ kind: 'path' });
  });
});

describe('hoverPlacement', () => {
  it('shows a green ghost on the snapped spot', () => {
    const ctx = contextFor(lockedOak);
    startPlacing(ctx, 'bench');
    hoverPlacement(ctx, { x: 20.2, y: 30.3 });
    expect(ctx.store.getState().ghost).toEqual({
      position: { x: 20, y: 30.5 },
      validity: { valid: true },
    });
  });

  it('shows a red ghost with the reason over a locked footprint', () => {
    const ctx = contextFor(lockedOak);
    startPlacing(ctx, 'bench');
    hoverPlacement(ctx, { x: 10, y: 10 });
    expect(ctx.store.getState().ghost?.validity).toMatchObject({
      valid: false,
      reason: 'locked footprint',
    });
  });

  it('does not snap while Alt is held, and lines up with a nearby item', () => {
    const ctx = contextFor(docOf({ items: [treeInput('t1', 30, 40)] }));
    startPlacing(ctx, 'bench');
    ctx.store.getState().setAlt('held');
    hoverPlacement(ctx, { x: 30.2, y: 12.34 });
    expect(ctx.store.getState().ghost?.position).toEqual({ x: 30, y: 12.34 });
    expect(ctx.store.getState().guides).toEqual([{ axis: 'x', value: 30 }]);
  });

  it('does nothing outside the place tool', () => {
    const ctx = contextFor(lockedOak);
    hoverPlacement(ctx, { x: 1, y: 1 });
    expect(ctx.store.getState().ghost).toBeNull();
  });
});

describe('placeAtPoint', () => {
  it('adds one item, selects it and goes back to select', () => {
    const ctx = contextFor(lockedOak);
    startPlacing(ctx, 'bench');
    const result = placeAtPoint(ctx, { x: 20, y: 20 });
    const state = ctx.store.getState();
    expect(result).toEqual({ valid: true });
    expect(state.document.items).toHaveLength(2);
    expect(state.document.items[1]).toMatchObject({
      catalogId: 'bench',
      position: { x: 20, y: 20 },
    });
    expect(state.tool).toEqual({ kind: 'select' });
    expect(state.selection).toEqual([{ kind: 'item', id: state.document.items[1]?.id }]);
  });

  it('keeps placing in paint mode', () => {
    const ctx = contextFor(lockedOak);
    ctx.store.getState().setPaint('on');
    startPlacing(ctx, 'bench');
    placeAtPoint(ctx, { x: 20, y: 20 });
    placeAtPoint(ctx, { x: 25, y: 20 });
    expect(ctx.store.getState().document.items).toHaveLength(3);
    expect(ctx.store.getState().tool).toEqual({ kind: 'place', catalogId: 'bench' });
  });

  it('refuses a blocked spot and adds nothing', () => {
    const ctx = contextFor(lockedOak);
    startPlacing(ctx, 'bench');
    expect(placeAtPoint(ctx, { x: 10, y: 10 })).toMatchObject({ valid: false });
    expect(ctx.store.getState().document.items).toHaveLength(1);
  });

  it('varies tree size and turn from the injected random', () => {
    const ctx = contextFor(lockedOak);
    startPlacing(ctx, 'douglas-fir');
    placeAtPoint(ctx, { x: 30, y: 30 });
    const tree = ctx.store.getState().document.items[1];
    expect(tree?.scaleJitter).toBeGreaterThanOrEqual(0.9);
    expect(tree?.scaleJitter).toBeLessThanOrEqual(1.1);
    expect(tree?.rotationDeg).not.toBe(0);
  });

  it('ignores clicks outside the place tool', () => {
    const ctx = contextFor(lockedOak);
    expect(placeAtPoint(ctx, { x: 20, y: 20 })).toBeNull();
  });
});

describe('placeAtPoint rejected notice', () => {
  it('leaves a lasting notice so a blocked click is never silent', () => {
    const ctx = contextFor(lockedOak);
    startPlacing(ctx, 'bench');
    placeAtPoint(ctx, { x: 10, y: 10 });
    expect(ctx.store.getState().notice).toMatchObject({
      kind: 'rejected',
      validity: { valid: false, reason: 'locked footprint' },
    });
  });

  it('clears the rejected notice once a placement lands', () => {
    const ctx = contextFor(lockedOak);
    ctx.store.getState().setPaint('on');
    startPlacing(ctx, 'bench');
    placeAtPoint(ctx, { x: 10, y: 10 });
    placeAtPoint(ctx, { x: 30, y: 30 });
    expect(ctx.store.getState().notice).toBeNull();
  });
});

describe('cancelTool', () => {
  it('clears a path draft first, then the tool, then the selection', () => {
    const ctx = contextFor(docOf({ items: [treeInput('t1', 30, 40)] }));
    ctx.store.getState().select([{ kind: 'item', id: 't1' }], 'replace');
    ctx.store.getState().setTool({ kind: 'path', surface: 'gravel', draft: [{ x: 1, y: 1 }] });
    cancelTool(ctx);
    expect(ctx.store.getState().tool).toEqual({ kind: 'path', surface: 'gravel', draft: [] });
    cancelTool(ctx);
    expect(ctx.store.getState().tool).toEqual({ kind: 'select' });
    expect(ctx.store.getState().selection).toHaveLength(1);
    cancelTool(ctx);
    expect(ctx.store.getState().selection).toHaveLength(0);
  });

  it('closes the shortcuts sheet', () => {
    const ctx = contextFor(lockedOak);
    ctx.store.getState().setShortcuts('open');
    cancelTool(ctx);
    expect(ctx.store.getState().shortcuts).toBe('closed');
  });
});

describe('placeAtPoint on a triangular parcel', () => {
  const triangle = [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 0, y: 60 },
  ];

  it('refuses a spot outside the triangle with the red ghost reason', () => {
    const ctx = contextFor(lockedOak, [], triangle);
    startPlacing(ctx, 'bench');
    const result = placeAtPoint(ctx, { x: 45, y: 45 });
    expect(result).toEqual({ valid: false, reason: 'outside park', label: 'bench' });
    expect(ctx.store.getState().document.items).toHaveLength(1);
    expect(ctx.store.getState().notice).toEqual({ kind: 'rejected', validity: result });
  });

  it('places inside the triangle as usual', () => {
    const ctx = contextFor(lockedOak, [], triangle);
    startPlacing(ctx, 'bench');
    expect(placeAtPoint(ctx, { x: 20, y: 20 })).toEqual({ valid: true });
  });
});
