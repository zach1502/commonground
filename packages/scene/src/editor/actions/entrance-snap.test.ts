import { describe, expect, it } from 'vitest';

import { ENTRANCE_SNAP_INSET_M } from '@parkshape/core';

import { docOf } from '../test-fixtures.js';

import { NO_GESTURE, pointerMove } from './gestures.js';
import { addPathPoint, finishPathDraft, movePathVertexTo } from './paths.js';
import { hoverPlacement, startPlacing } from './placing.js';
import { contextFor } from './test-context.js';

// The 60 m test parcel with a sidewalk 1.5 m outside its south edge.
const targets = {
  parcel: [
    { x: 0, y: 0 },
    { x: 60, y: 0 },
    { x: 60, y: 60 },
    { x: 0, y: 60 },
  ],
  sidewalks: [
    [
      { x: -20, y: -1.5 },
      { x: 80, y: -1.5 },
    ],
  ],
};

function editorWithSidewalk() {
  const ctx = contextFor(docOf());
  ctx.store.getState().setEntranceSnap(targets);
  return ctx;
}

describe('entrance snap in the path tool', () => {
  it('snaps a path point 3 m from the sidewalk to the edge and marks the sidewalk point', () => {
    const ctx = editorWithSidewalk();
    startPlacing(ctx, 'path-gravel');
    addPathPoint(ctx, { x: 20.2, y: 1.5 });
    const state = ctx.store.getState();
    const draft = state.tool.kind === 'path' ? state.tool.draft : [];
    expect(draft[0]?.x).toBeCloseTo(20.2);
    expect(draft[0]?.y).toBeCloseTo(ENTRANCE_SNAP_INSET_M);
    expect(state.entranceMarker?.x).toBeCloseTo(20.2);
    expect(state.entranceMarker?.y).toBeCloseTo(-1.5);
  });

  it('wins over the 0.5 m grid snap', () => {
    const ctx = editorWithSidewalk();
    startPlacing(ctx, 'path-gravel');
    addPathPoint(ctx, { x: 20.2, y: 1.4 });
    const state = ctx.store.getState();
    const draft = state.tool.kind === 'path' ? state.tool.draft : [];
    expect(draft[0]?.x).toBeCloseTo(20.2);
  });

  it('leaves a point 5.1 m from the sidewalk on the grid, with no marker', () => {
    const ctx = editorWithSidewalk();
    startPlacing(ctx, 'path-gravel');
    addPathPoint(ctx, { x: 20.2, y: 3.6 });
    const state = ctx.store.getState();
    const draft = state.tool.kind === 'path' ? state.tool.draft : [];
    expect(draft[0]).toEqual({ x: 20, y: 3.5 });
    expect(state.entranceMarker).toBeNull();
  });

  it('turns off while Alt is held', () => {
    const ctx = editorWithSidewalk();
    startPlacing(ctx, 'path-gravel');
    ctx.store.getState().setAlt('held');
    addPathPoint(ctx, { x: 20.2, y: 1.2 });
    const state = ctx.store.getState();
    const draft = state.tool.kind === 'path' ? state.tool.draft : [];
    expect(draft[0]).toEqual({ x: 20.2, y: 1.2 });
    expect(state.entranceMarker).toBeNull();
  });

  it('changes nothing with no context loaded', () => {
    const ctx = contextFor(docOf());
    startPlacing(ctx, 'path-gravel');
    addPathPoint(ctx, { x: 20.2, y: 1.2 });
    const state = ctx.store.getState();
    const draft = state.tool.kind === 'path' ? state.tool.draft : [];
    expect(draft[0]).toEqual({ x: 20, y: 1 });
  });
});

describe('entrance snap while hovering and editing', () => {
  it('shows the snapped spot on the path ghost before the click', () => {
    const ctx = editorWithSidewalk();
    startPlacing(ctx, 'path-gravel');
    pointerMove(ctx, NO_GESTURE, { point: { x: 20.2, y: 1.2 }, shift: 'released' });
    expect(ctx.store.getState().ghost?.position.y).toBeCloseTo(ENTRANCE_SNAP_INSET_M);
    expect(ctx.store.getState().entranceMarker?.x).toBeCloseTo(20.2);
    expect(ctx.store.getState().entranceMarker?.y).toBeCloseTo(-1.5);
  });

  it('clears the marker when the pointer moves away from the sidewalk', () => {
    const ctx = editorWithSidewalk();
    startPlacing(ctx, 'path-gravel');
    pointerMove(ctx, NO_GESTURE, { point: { x: 20.2, y: 1.2 }, shift: 'released' });
    pointerMove(ctx, NO_GESTURE, { point: { x: 20.2, y: 30 }, shift: 'released' });
    expect(ctx.store.getState().entranceMarker).toBeNull();
  });

  it('does not snap an item that is not an entrance', () => {
    const ctx = editorWithSidewalk();
    startPlacing(ctx, 'bench');
    hoverPlacement(ctx, { x: 20.2, y: 1.2 });
    expect(ctx.store.getState().ghost?.position).toEqual({ x: 20, y: 1 });
  });

  it('snaps the end vertex of a path when it is moved near the sidewalk, not a middle one', () => {
    const ctx = editorWithSidewalk();
    startPlacing(ctx, 'path-gravel');
    addPathPoint(ctx, { x: 20, y: 30 });
    addPathPoint(ctx, { x: 30, y: 30 });
    addPathPoint(ctx, { x: 40, y: 30 });
    finishPathDraft(ctx);
    const path = ctx.store.getState().document.paths[0];
    if (path === undefined) throw new Error('no path');
    movePathVertexTo(ctx, path.id, 1, { x: 30, y: 2 });
    movePathVertexTo(ctx, path.id, 2, { x: 40.2, y: 2 });
    const moved = ctx.store.getState().document.paths[0]?.points ?? [];
    expect(moved[1]).toEqual({ x: 30, y: 2 });
    expect(moved[2]?.y).toBeCloseTo(ENTRANCE_SNAP_INSET_M);
  });
});
