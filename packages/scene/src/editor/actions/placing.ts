import { designItemSchema, snapEntrance, type PlanePoint } from '@parkshape/core';

import { addItem } from '../commands.js';
import { isTree, newElementId, treeScaleJitter } from '../ids.js';
import { validatePlacement, type PlacementValidity } from '../placement-validity.js';
import { randomRotation } from '../rotation.js';
import { alignToNeighbours, ALIGN_TOLERANCE_M, snapPoint } from '../snap.js';
import { snapMode } from '../store/selectors.js';

import type { EditorContext } from './context.js';

// On the grid, guides show only for exact lines; free drags pull toward nearby items.
const EXACT_ALIGN_M = 1e-6;

/** Picks the tool for a palette entry: place for point items, area and path for the rest. */
export function startPlacing(ctx: EditorContext, catalogId: string): void {
  const entry = ctx.catalog.get(catalogId);
  if (entry === undefined) return;
  const { setTool } = ctx.store.getState();
  if (entry.geometryKind === 'point') setTool({ kind: 'place', catalogId });
  if (entry.geometryKind === 'area') setTool({ kind: 'area', catalogId, draft: null });
  if (entry.geometryKind === 'linear') {
    const surface = catalogId.replace(/^path-/, '');
    if (surface === 'asphalt' || surface === 'gravel' || surface === 'boardwalk') {
      setTool({ kind: 'path', surface, draft: [] });
    }
  }
}

// The catalog's entrance item; a path's first and last points are entrances too.
const ENTRANCE_ITEMS: ReadonlySet<string> = new Set(['gate']);

/** What the point is for: an entrance snaps to the parcel edge facing a nearby sidewalk. */
export type SnapRole = 'entrance' | 'plain';

/** An entrance near a sidewalk lands on the parcel edge and marks the sidewalk point. */
function entrancePoint(ctx: EditorContext, point: PlanePoint): PlanePoint | null {
  const state = ctx.store.getState();
  const targets = state.entranceSnap;
  const snap = targets === null ? null : snapEntrance({ point, ...targets, modifier: state.alt });
  state.setEntranceMarker(snap?.kind === 'snapped' ? snap.sidewalk : null);
  if (snap?.kind !== 'snapped') return null;
  state.setGuides([]);
  return snap.point;
}

/**
 * Snaps the pointer and lines it up with nearby items, setting the guides to draw. An entrance
 * snap wins over the grid; Alt turns both off.
 */
export function snappedPoint(
  ctx: EditorContext,
  point: PlanePoint,
  role: SnapRole = 'plain',
): PlanePoint {
  const entrance = role === 'entrance' ? entrancePoint(ctx, point) : null;
  if (entrance !== null) return entrance;
  if (role === 'plain') ctx.store.getState().setEntranceMarker(null);
  const state = ctx.store.getState();
  const mode = snapMode(state);
  const tolerance = mode === 'grid' ? EXACT_ALIGN_M : ALIGN_TOLERANCE_M;
  const aligned = alignToNeighbours(snapPoint(point, mode), state.document.items, tolerance);
  state.setGuides(aligned.guides.map(({ axis, value }) => ({ axis, value })));
  return aligned.point;
}

const roleOf = (catalogId: string): SnapRole =>
  ENTRANCE_ITEMS.has(catalogId) ? 'entrance' : 'plain';

function candidateValidity(ctx: EditorContext, catalogId: string, position: PlanePoint) {
  return validatePlacement({
    document: ctx.store.getState().document,
    catalog: ctx.catalog,
    candidate: { catalogId, position, rotationDeg: 0 },
    zones: ctx.zones,
    lockedFootprints: ctx.locked,
    slopeSampler: ctx.slopeAt,
    grid: ctx.grid,
    onGround: ctx.onGround,
  });
}

/** Moves the ghost to the pointer and colours it by whether the item can go there. */
export function hoverPlacement(ctx: EditorContext, point: PlanePoint): void {
  const { tool, setGhost } = ctx.store.getState();
  if (tool.kind !== 'place') return;
  const position = snappedPoint(ctx, point, roleOf(tool.catalogId));
  setGhost({ position, validity: candidateValidity(ctx, tool.catalogId, position) });
}

function buildItem(ctx: EditorContext, catalogId: string, position: PlanePoint) {
  const entry = ctx.catalog.get(catalogId);
  const tree = isTree(entry);
  return designItemSchema.parse({
    id: newElementId('item', ctx.random, ctx.store.getState().document),
    catalogId,
    position,
    rotationDeg: tree ? randomRotation(ctx.random) : 0,
    locked: false,
    ...(tree ? { scaleJitter: treeScaleJitter(ctx.random) } : {}),
  });
}

/** Places the item at the pointer. Returns null outside the place tool. */
export function placeAtPoint(ctx: EditorContext, point: PlanePoint): PlacementValidity | null {
  const { tool } = ctx.store.getState();
  if (tool.kind !== 'place') return null;
  const position = snappedPoint(ctx, point, roleOf(tool.catalogId));
  const validity = candidateValidity(ctx, tool.catalogId, position);
  const state = ctx.store.getState();
  if (!validity.valid) {
    state.setNotice({ kind: 'rejected', validity });
    return validity;
  }
  const item = buildItem(ctx, tool.catalogId, position);
  state.setNotice(null);
  state.execute(addItem(item));
  if (state.paint === 'off') {
    state.setTool({ kind: 'select' });
    state.select([{ kind: 'item', id: item.id }], 'replace');
  }
  return validity;
}

/** Places an item from typed coordinates, for the Items list. Snapping does not apply. */
export function placeItemAt(
  ctx: EditorContext,
  catalogId: string,
  position: PlanePoint,
): PlacementValidity {
  const validity = candidateValidity(ctx, catalogId, position);
  if (!validity.valid) return validity;
  const item = buildItem(ctx, catalogId, position);
  const state = ctx.store.getState();
  state.execute(addItem(item));
  state.select([{ kind: 'item', id: item.id }], 'replace');
  return validity;
}

/** Esc: drop a path draft, then the tool, then the selection. Also closes the sheet. */
export function cancelTool(ctx: EditorContext): void {
  const state = ctx.store.getState();
  state.setShortcuts('closed');
  state.setNotice(null);
  const { tool } = state;
  if (tool.kind === 'path' && tool.draft.length > 0) {
    state.setTool({ ...tool, draft: [] });
    return;
  }
  if (tool.kind !== 'select') {
    state.setTool({ kind: 'select' });
    return;
  }
  state.clearSelection();
}
