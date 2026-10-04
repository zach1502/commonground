import {
  designAreaSchema,
  polygonArea,
  polygonSchema,
  zoneSchema,
  type CatalogIndex,
  type PlanePoint,
} from '@parkshape/core';

import {
  addCorner,
  areaSummary,
  moveEdge,
  rectangleFromDrag,
  type AreaSummary,
} from '../area-tool.js';
import { addArea, addZone, moveAreaVertex, resizeArea } from '../commands.js';
import { newElementId } from '../ids.js';
import { selectedAreas } from '../store/selectors.js';
import type { EditorState, Tool } from '../store/types.js';

import type { EditorContext } from './context.js';
import { snappedPoint } from './placing.js';

// A zone smaller than one square metre is a slip of the mouse.
const MIN_ZONE_AREA_M2 = 1;

type DraftTool = Extract<Tool, { kind: 'area' | 'zone' }>;

function draftTool(tool: Tool): DraftTool | null {
  return tool.kind === 'area' || tool.kind === 'zone' ? tool : null;
}

function summaryFor(catalog: CatalogIndex, catalogId: string, polygon: readonly PlanePoint[]) {
  const entry = catalog.get(catalogId);
  return entry?.geometryKind === 'area' ? areaSummary(entry, polygon) : null;
}

/** Area and plots of the rectangle being dragged, or of the one selected area. */
export function selectedAreaSummary(state: EditorState, catalog: CatalogIndex): AreaSummary | null {
  const { tool } = state;
  if (tool.kind === 'area' && tool.draft !== null) {
    return summaryFor(catalog, tool.catalogId, rectangleFromDrag(tool.draft.start, tool.draft.end));
  }
  const [area, ...others] = selectedAreas(state);
  if (area === undefined || others.length > 0) return null;
  return summaryFor(catalog, area.catalogId, area.polygon);
}

/** Whether every corner is on the parcel's ground, so no part of an area leaves the park. */
function allOnGround(ctx: EditorContext, corners: readonly PlanePoint[]): boolean {
  return corners.every((corner) => ctx.onGround(corner));
}

/** The four corners of the dragged rectangle from start to end. */
function rectangleCorners(start: PlanePoint, end: PlanePoint): PlanePoint[] {
  return [start, { x: end.x, y: start.y }, end, { x: start.x, y: end.y }];
}

export function beginArea(ctx: EditorContext, point: PlanePoint): void {
  const { setTool } = ctx.store.getState();
  const tool = draftTool(ctx.store.getState().tool);
  if (tool === null) return;
  const start = snappedPoint(ctx, point);
  if (!ctx.onGround(start)) return;
  setTool({ ...tool, draft: { start, end: start } });
}

/** The anchored first corner of a click-click area, or null when none is placed yet. */
export function areaDraftStart(ctx: EditorContext): PlanePoint | null {
  return draftTool(ctx.store.getState().tool)?.draft?.start ?? null;
}

export function dragAreaTo(ctx: EditorContext, point: PlanePoint): void {
  const { setTool } = ctx.store.getState();
  const tool = draftTool(ctx.store.getState().tool);
  if (tool?.draft === null || tool === null) return;
  const end = snappedPoint(ctx, point);
  if (!allOnGround(ctx, rectangleCorners(tool.draft.start, end))) return;
  setTool({ ...tool, draft: { ...tool.draft, end } });
}

type FinishOutcome = 'added' | 'too-small' | 'none';

/** Staff only: adds the dragged rectangle as a forbidden or no-grade zone. */
function finishZone(ctx: EditorContext, tool: Extract<Tool, { kind: 'zone' }>): FinishOutcome {
  const state = ctx.store.getState();
  if (tool.draft === null) return 'none';
  const polygon = rectangleFromDrag(tool.draft.start, tool.draft.end);
  state.setTool({ ...tool, draft: null });
  const ring = polygonSchema.safeParse(polygon);
  if (!ring.success || polygonArea(ring.data) < MIN_ZONE_AREA_M2) {
    state.setNotice({ kind: 'area-too-small', minAreaM2: MIN_ZONE_AREA_M2 });
    return 'too-small';
  }
  const zone = zoneSchema.parse({
    id: newElementId('zone', ctx.random, state.document),
    kind: tool.zoneKind,
    polygon,
    label: tool.label,
  });
  state.execute(addZone(zone));
  state.setNotice(null);
  state.setTool({ kind: 'select' });
  return 'added';
}

/** Adds the dragged rectangle if it is big enough, then selects it for shaping. */
export function finishArea(ctx: EditorContext): FinishOutcome {
  const state = ctx.store.getState();
  const { tool } = state;
  if (tool.kind === 'zone') return finishZone(ctx, tool);
  if (tool.kind !== 'area' || tool.draft === null) return 'none';
  const polygon = rectangleFromDrag(tool.draft.start, tool.draft.end);
  const summary = selectedAreaSummary(state, ctx.catalog);
  state.setTool({ ...tool, draft: null });
  if (summary === null) return 'none';
  if (summary.size === 'too-small') {
    state.setNotice({ kind: 'area-too-small', minAreaM2: summary.minAreaM2 });
    return 'too-small';
  }
  const area = designAreaSchema.parse({
    id: newElementId('area', ctx.random, state.document),
    catalogId: tool.catalogId,
    polygon,
    locked: false,
  });
  state.execute(addArea(area));
  state.setNotice(null);
  state.setTool({ kind: 'select' });
  state.select([{ kind: 'area', id: area.id }], 'replace');
  return 'added';
}

function unlockedArea(ctx: EditorContext, id: string) {
  return ctx.store.getState().document.areas.find((area) => area.id === id && !area.locked);
}

export function moveAreaCorner(ctx: EditorContext, id: string, index: number, point: PlanePoint) {
  const from = unlockedArea(ctx, id)?.polygon[index];
  const to = snappedPoint(ctx, point);
  if (from !== undefined && ctx.onGround(to)) {
    ctx.store.getState().execute(moveAreaVertex(id, index, from, to));
  }
}

export function moveAreaEdge(ctx: EditorContext, id: string, edgeIndex: number, delta: PlanePoint) {
  const area = unlockedArea(ctx, id);
  if (area === undefined) return;
  const moved = moveEdge(area.polygon, edgeIndex, delta);
  const edgeStart = moved[edgeIndex];
  if (edgeStart === undefined) return;
  const snapped = snappedPoint(ctx, edgeStart);
  const correction = { x: snapped.x - edgeStart.x, y: snapped.y - edgeStart.y };
  const shifted = moveEdge(moved, edgeIndex, correction);
  if (allOnGround(ctx, shifted))
    ctx.store.getState().execute(resizeArea(id, area.polygon, shifted));
}

/** Add corner: the next click on the ground puts a corner on the nearest edge. */
export function beginAddCorner(ctx: EditorContext, areaId: string): void {
  if (unlockedArea(ctx, areaId) !== undefined) {
    ctx.store.getState().setTool({ kind: 'add-corner', areaId });
  }
}

export function addCornerAt(ctx: EditorContext, point: PlanePoint): void {
  const state = ctx.store.getState();
  const { tool } = state;
  if (tool.kind !== 'add-corner') return;
  const area = unlockedArea(ctx, tool.areaId);
  state.setTool({ kind: 'select' });
  const corner = snappedPoint(ctx, point);
  if (area === undefined || !ctx.onGround(corner)) return;
  state.execute(resizeArea(area.id, area.polygon, addCorner(area.polygon, corner)));
}
