import type { DesignDocument, PlanePoint } from '@parkshape/core';

import {
  batch,
  deleteArea,
  deleteItem,
  deletePath,
  duplicateItem,
  movePathVertex,
  moveItem,
  resizeArea,
  rotateItem,
  toCommand,
  type SingleCommandSpec,
} from '../commands.js';
import { newElementId } from '../ids.js';
import {
  normaliseDegrees,
  rotateByStep,
  rotationFromDrag,
  ROTATION_STEP_DEG,
  type RotationDirection,
} from '../rotation.js';
import { elementAt, marqueeHits, type Marquee } from '../selection.js';
import { snapPoint } from '../snap.js';
import { selectedAreas, selectedItems, selectedPaths, snapMode } from '../store/selectors.js';
import type { EditorState, SelectMode } from '../store/types.js';
import type { ElementRef } from '../types.js';

import type { EditorContext } from './context.js';

/** Copies land this far from the original so both stay visible. */
export const DUPLICATE_OFFSET: PlanePoint = { x: 1, y: -1 };

const shift = (point: PlanePoint, delta: PlanePoint) => ({
  x: point.x + delta.x,
  y: point.y + delta.y,
});

export function pointerSelect(ctx: EditorContext, point: PlanePoint, mode: SelectMode): void {
  selectHit(ctx, elementAt(point, ctx.store.getState().document, ctx.catalog), mode);
}

/** Selects what the pointer hit, shows the lock badge for a locked one, or clears on a miss. */
export function selectHit(ctx: EditorContext, hit: ElementRef | null, mode: SelectMode): void {
  const state = ctx.store.getState();
  state.setNotice(hit?.locked === 'locked' ? { kind: 'locked', id: hit.id } : null);
  if (hit === null) {
    if (mode === 'replace') state.clearSelection();
    return;
  }
  state.select([hit], mode);
}

export function marqueeSelect(ctx: EditorContext, marquee: Marquee, mode: SelectMode): void {
  const state = ctx.store.getState();
  state.select(marqueeHits(marquee, state.document), mode);
}

function moveSpecs(state: EditorState, delta: PlanePoint): SingleCommandSpec[] {
  return [
    ...selectedItems(state).map((item) =>
      moveItem(item.id, item.position, shift(item.position, delta)),
    ),
    ...selectedPaths(state).flatMap((path) =>
      path.points.map((point, index) => movePathVertex(path.id, index, point, shift(point, delta))),
    ),
    ...selectedAreas(state).map((area) =>
      resizeArea(
        area.id,
        area.polygon,
        area.polygon.map((point) => shift(point, delta)),
      ),
    ),
  ];
}

/** The document as drawn during a drag, with the selection shifted by the drag. */
export function previewDocument(state: EditorState): DesignDocument {
  const { drag } = state;
  if (drag === null) return state.document;
  return toCommand(batch(moveSpecs(state, drag))).apply(state.document);
}

/**
 * Tracks a drag from where it grabbed the selection. The first selected element's reference
 * point is what snaps, so the whole selection lands on the grid together.
 */
export function dragSelection(
  ctx: EditorContext,
  { grab, pointer }: { readonly grab: PlanePoint; readonly pointer: PlanePoint },
): void {
  const state = ctx.store.getState();
  const anchor =
    selectedItems(state)[0]?.position ??
    selectedPaths(state)[0]?.points[0] ??
    selectedAreas(state)[0]?.polygon[0] ??
    grab;
  const target = snapPoint(
    shift(anchor, { x: pointer.x - grab.x, y: pointer.y - grab.y }),
    snapMode(state),
  );
  state.setDrag({ x: target.x - anchor.x, y: target.y - anchor.y });
}

function executeAll(ctx: EditorContext, specs: readonly SingleCommandSpec[]): void {
  if (specs.length === 0) return;
  const [only] = specs;
  ctx.store.getState().execute(specs.length === 1 && only !== undefined ? only : batch(specs));
}

export function commitDrag(ctx: EditorContext): void {
  const state = ctx.store.getState();
  const { drag } = state;
  state.setDrag(null);
  if (drag === null || (drag.x === 0 && drag.y === 0)) return;
  executeAll(ctx, moveSpecs(state, drag));
}

export function nudgeSelection(ctx: EditorContext, delta: PlanePoint): void {
  executeAll(ctx, moveSpecs(ctx.store.getState(), delta));
}

export function rotateSelection(ctx: EditorContext, direction: RotationDirection): void {
  const specs = selectedItems(ctx.store.getState()).map((item) =>
    rotateItem(item.id, item.rotationDeg, rotateByStep(item.rotationDeg, direction)),
  );
  executeAll(ctx, specs);
}

/** The rotate handle: one step per 20 px of drag, or one step for a click without a drag. */
export function rotateSelectionByDrag(ctx: EditorContext, dragPx: number): void {
  const turn = (degrees: number) => {
    const dragged = rotationFromDrag(degrees, dragPx);
    return dragged === normaliseDegrees(degrees)
      ? normaliseDegrees(degrees + ROTATION_STEP_DEG)
      : dragged;
  };
  const specs = selectedItems(ctx.store.getState()).map((item) =>
    rotateItem(item.id, item.rotationDeg, turn(item.rotationDeg)),
  );
  executeAll(ctx, specs);
}

export function duplicateSelection(ctx: EditorContext): void {
  const state = ctx.store.getState();
  let document = state.document;
  const specs = selectedItems(state).map((item) => {
    const spec = duplicateItem(item, newElementId('item', ctx.random, document), DUPLICATE_OFFSET);
    document = toCommand(spec).apply(document);
    return spec;
  });
  executeAll(ctx, specs);
  const copies = specs.flatMap((spec) => (spec.kind === 'add-item' ? [spec.item.id] : []));
  if (copies.length > 0)
    state.select(
      copies.map((id) => ({ kind: 'item', id })),
      'replace',
    );
}

/** Each delete records the index it had after the deletes before it, so undo restores order. */
function deleteSpecs(state: EditorState): SingleCommandSpec[] {
  let document = state.document;
  const record = (spec: SingleCommandSpec) => {
    document = toCommand(spec).apply(document);
    return spec;
  };
  const indexIn = (list: readonly { readonly id: string }[], id: string) =>
    list.findIndex((entry) => entry.id === id);
  return [
    ...selectedItems(state).map((item) =>
      record(deleteItem(item, indexIn(document.items, item.id))),
    ),
    ...selectedPaths(state).map((path) =>
      record(deletePath(path, indexIn(document.paths, path.id))),
    ),
    ...selectedAreas(state).map((area) =>
      record(deleteArea(area, indexIn(document.areas, area.id))),
    ),
  ];
}

export function deleteSelection(ctx: EditorContext): void {
  executeAll(ctx, deleteSpecs(ctx.store.getState()));
}

function unlockedItem(ctx: EditorContext, id: string) {
  return ctx.store.getState().document.items.find((item) => item.id === id && !item.locked);
}

export function setItemPosition(ctx: EditorContext, id: string, position: PlanePoint): void {
  const item = unlockedItem(ctx, id);
  if (item !== undefined) executeAll(ctx, [moveItem(id, item.position, position)]);
}

export function setItemRotation(ctx: EditorContext, id: string, degrees: number): void {
  const item = unlockedItem(ctx, id);
  if (item !== undefined) {
    executeAll(ctx, [rotateItem(id, item.rotationDeg, normaliseDegrees(degrees))]);
  }
}
