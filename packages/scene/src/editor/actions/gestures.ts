import type { PlanePoint } from '@parkshape/core';

import { elementAt } from '../selection.js';
import { isSelected } from '../store/selectors.js';
import type { ElementRef } from '../types.js';

import {
  addCornerAt,
  areaDraftStart,
  beginArea,
  dragAreaTo,
  finishArea,
  moveAreaCorner,
} from './areas.js';
import type { EditorContext } from './context.js';
import { addPathPoint, finishPathDraft, movePathVertexTo, snappedVertexPoint } from './paths.js';
import { cancelTool, hoverPlacement, placeAtPoint, snappedPoint } from './placing.js';
import { commitDrag, dragSelection, marqueeSelect, selectHit } from './selecting.js';
import { gestureAreaTool } from './staff.js';

export interface PointerInput {
  /** Where the pointer ray reached the ground. */
  readonly point: PlanePoint;
  readonly shift: 'held' | 'released';
  /** The item whose model the ray passed through before the ground, if any. */
  readonly aimed?: string | undefined;
}

/** What a press on the canvas turned into. 'none' leaves the drag to the camera. */
export type Gesture =
  | { readonly kind: 'none' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'move'; readonly grab: PlanePoint }
  | { readonly kind: 'marquee'; readonly from: PlanePoint; readonly to: PlanePoint }
  | { readonly kind: 'area'; readonly start: PlanePoint }
  | {
      readonly kind: 'vertex' | 'corner';
      readonly id: string;
      readonly index: number;
      readonly point: PlanePoint | null;
    };

export const NO_GESTURE: Gesture = { kind: 'none' };

/** A press within this many metres of the first corner is a click, so the corner stays anchored. */
const AREA_CLICK_SLOP_M = 1;

/** The element under the pointer: the item model the ray passed through, else the ground pick. */
function hitOf(ctx: EditorContext, input: PointerInput): ElementRef | null {
  const { document } = ctx.store.getState();
  const aimed = document.items.find((item) => item.id === input.aimed);
  if (aimed === undefined) return elementAt(input.point, document, ctx.catalog);
  return aimed.locked
    ? { kind: 'item', id: aimed.id, locked: 'locked' }
    : { kind: 'item', id: aimed.id };
}

function selectDown(ctx: EditorContext, input: PointerInput): Gesture {
  const state = ctx.store.getState();
  const hit = hitOf(ctx, input);
  if (hit?.locked === 'locked') {
    state.setNotice({ kind: 'locked', id: hit.id });
    return { kind: 'blocked' };
  }
  if (hit !== null && isSelected(state, hit.id)) return { kind: 'move', grab: input.point };
  if (hit === null && input.shift === 'held') {
    return { kind: 'marquee', from: input.point, to: input.point };
  }
  return NO_GESTURE;
}

export function pointerDown(ctx: EditorContext, input: PointerInput): Gesture {
  const { tool } = ctx.store.getState();
  if (tool.kind === 'select') return selectDown(ctx, input);
  if (gestureAreaTool(tool) !== 'none') {
    const anchor = areaDraftStart(ctx);
    if (anchor !== null) {
      dragAreaTo(ctx, input.point);
      return { kind: 'area', start: anchor };
    }
    beginArea(ctx, input.point);
    return { kind: 'area', start: input.point };
  }
  return NO_GESTURE;
}

/** A press on a vertex or corner handle. */
export function handleDown(
  ctx: EditorContext,
  handle: { readonly kind: 'vertex' | 'corner'; readonly id: string; readonly index: number },
): Gesture {
  ctx.store.getState().setNotice(null);
  return { ...handle, point: null };
}

function hover(ctx: EditorContext, input: PointerInput): void {
  const { point } = input;
  const { tool, setGhost, setHovered } = ctx.store.getState();
  if (tool.kind === 'select') {
    const hit = hitOf(ctx, input);
    setHovered(hit === null || hit.locked === 'locked' ? null : hit.id);
    return;
  }
  if (tool.kind === 'place') hoverPlacement(ctx, point);
  if (tool.kind === 'path')
    setGhost({ position: snappedPoint(ctx, point, 'entrance'), validity: { valid: true } });
  if ((tool.kind === 'area' || tool.kind === 'zone') && tool.draft !== null) {
    dragAreaTo(ctx, point);
  }
}

export function pointerMove(ctx: EditorContext, gesture: Gesture, input: PointerInput): Gesture {
  switch (gesture.kind) {
    case 'move':
      dragSelection(ctx, { grab: gesture.grab, pointer: input.point });
      return gesture;
    case 'marquee':
      return { ...gesture, to: input.point };
    case 'area':
      dragAreaTo(ctx, input.point);
      return gesture;
    case 'vertex':
      return { ...gesture, point: snappedVertexPoint(ctx, gesture, input.point) };
    case 'corner':
      return { ...gesture, point: snappedPoint(ctx, input.point) };
    case 'none':
      hover(ctx, input);
      return gesture;
    case 'blocked':
      return gesture;
  }
}

export function pointerUp(ctx: EditorContext, gesture: Gesture, input: PointerInput): void {
  const mode = input.shift === 'held' ? 'add' : 'replace';
  if (gesture.kind === 'move') commitDrag(ctx);
  if (gesture.kind === 'marquee') marqueeSelect(ctx, gesture, mode);
  if (gesture.kind === 'area') {
    // A drag from the start finishes the rectangle; a click leaves the first corner anchored.
    const moved = Math.hypot(input.point.x - gesture.start.x, input.point.y - gesture.start.y);
    if (moved > AREA_CLICK_SLOP_M) finishArea(ctx);
  }
  if (gesture.kind === 'vertex' && gesture.point !== null) {
    movePathVertexTo(ctx, gesture.id, gesture.index, gesture.point);
  }
  if (gesture.kind === 'corner' && gesture.point !== null) {
    moveAreaCorner(ctx, gesture.id, gesture.index, gesture.point);
  }
}

/** A click that did not drag: select, place, add a path point or add a corner. */
export function clickAt(ctx: EditorContext, input: PointerInput): void {
  const { tool } = ctx.store.getState();
  if (tool.kind === 'select') {
    selectHit(ctx, hitOf(ctx, input), input.shift === 'held' ? 'toggle' : 'replace');
  }
  if (tool.kind === 'place') placeAtPoint(ctx, input.point);
  if (tool.kind === 'path') addPathPoint(ctx, input.point);
  if (tool.kind === 'add-corner') addCornerAt(ctx, input.point);
}

export function doubleClickAt(ctx: EditorContext): void {
  if (ctx.store.getState().tool.kind === 'path') finishPathDraft(ctx);
}

/** Right-click leaves paint mode or any other tool, like Esc. */
export function contextMenuAt(ctx: EditorContext): void {
  if (ctx.store.getState().tool.kind !== 'select') cancelTool(ctx);
}
