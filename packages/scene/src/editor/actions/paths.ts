import { designPathSchema, type PlanePoint } from '@parkshape/core';

import { addPath, insertPathVertex, movePathVertex } from '../commands.js';
import { newElementId } from '../ids.js';
import { pathWidthM } from '../path-draft.js';
import { appendPoint, finishPath, removeLastPoint, segmentMidpoints } from '../path-tool.js';

import type { EditorContext } from './context.js';
import { snappedPoint } from './placing.js';

/** Adds a point to the path draft; a point off the parcel's ground is refused. */
export function addPathPoint(ctx: EditorContext, point: PlanePoint): void {
  const { tool, setTool, hintEvent } = ctx.store.getState();
  if (tool.kind !== 'path') return;
  // The newest point is the path's last, so it may be an entrance.
  const snapped = snappedPoint(ctx, point, 'entrance');
  if (!ctx.onGround(snapped)) return;
  setTool({ ...tool, draft: appendPoint(tool.draft, snapped) });
  hintEvent('path-point-added');
}

/** Backspace while drawing. */
export function removePathPoint(ctx: EditorContext): void {
  const { tool, setTool } = ctx.store.getState();
  if (tool.kind === 'path') setTool({ ...tool, draft: removeLastPoint(tool.draft) });
}

/** Double-click or Enter. The path takes the width of its surface from the catalog. */
export function finishPathDraft(ctx: EditorContext): 'finished' | 'too-short' {
  const state = ctx.store.getState();
  const { tool } = state;
  if (tool.kind !== 'path') return 'too-short';
  const result = finishPath(tool.draft);
  if (result.kind === 'too-short') {
    state.setNotice({ kind: 'path-too-short' });
    return result.kind;
  }
  const widthM = pathWidthM(ctx.catalog, tool.surface);
  const path = designPathSchema.parse({
    id: newElementId('path', ctx.random, state.document),
    surface: tool.surface,
    widthM,
    points: result.points,
  });
  state.execute(addPath(path));
  state.setTool({ ...tool, draft: [] });
  state.setNotice(null);
  return result.kind;
}

function pathById(ctx: EditorContext, id: string) {
  return ctx.store.getState().document.paths.find((path) => path.id === id);
}

/** A dragged vertex snaps like any point, and like an entrance when it is the first or last. */
export function snappedVertexPoint(
  ctx: EditorContext,
  vertex: { readonly id: string; readonly index: number },
  point: PlanePoint,
): PlanePoint {
  const count = pathById(ctx, vertex.id)?.points.length ?? 0;
  const end = vertex.index === 0 || vertex.index === count - 1;
  return snappedPoint(ctx, point, end ? 'entrance' : 'plain');
}

export function movePathVertexTo(
  ctx: EditorContext,
  id: string,
  index: number,
  point: PlanePoint,
): void {
  const from = pathById(ctx, id)?.points[index];
  if (from === undefined) return;
  const to = snappedVertexPoint(ctx, { id, index }, point);
  if (ctx.onGround(to)) ctx.store.getState().execute(movePathVertex(id, index, from, to));
}

/** The plus sign at a segment midpoint. */
export function insertPathMidpoint(ctx: EditorContext, id: string, segmentIndex: number): void {
  const path = pathById(ctx, id);
  const midpoint = path === undefined ? undefined : segmentMidpoints(path.points)[segmentIndex];
  if (midpoint === undefined) return;
  ctx.store.getState().execute(insertPathVertex(id, segmentIndex + 1, midpoint));
}
