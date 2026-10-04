import {
  polygonContains,
  type CatalogIndex,
  type DesignDocument,
  type DesignItem,
  type PlanePoint,
} from '@parkshape/core';

import type { ElementRef } from './types.js';

/** Small items get at least this much reach on each side, so a 0.6 m trunk is clickable. */
export const MIN_PICK_HALF_M = 1;
const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;

export interface Marquee {
  readonly from: PlanePoint;
  readonly to: PlanePoint;
}

function inBox(marquee: Marquee, point: PlanePoint): boolean {
  const minX = Math.min(marquee.from.x, marquee.to.x);
  const maxX = Math.max(marquee.from.x, marquee.to.x);
  const minY = Math.min(marquee.from.y, marquee.to.y);
  const maxY = Math.max(marquee.from.y, marquee.to.y);
  return point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
}

/** Unlocked items with their centre in the box, and paths and areas wholly inside it. */
export function marqueeHits(marquee: Marquee, document: DesignDocument): ElementRef[] {
  const inside = (point: PlanePoint) => inBox(marquee, point);
  return [
    ...document.items
      .filter((item) => !item.locked && inside(item.position))
      .map((item) => ({ kind: 'item' as const, id: item.id })),
    ...document.paths
      .filter((path) => path.points.every(inside))
      .map((path) => ({ kind: 'path' as const, id: path.id })),
    ...document.areas
      .filter((area) => !area.locked && area.polygon.every(inside))
      .map((area) => ({ kind: 'area' as const, id: area.id })),
  ];
}

function itemReach(item: DesignItem, catalog: CatalogIndex, point: PlanePoint): number | null {
  const entry = catalog.get(item.catalogId);
  const size = entry?.geometryKind === 'point' ? entry.footprint : { widthM: 0, depthM: 0 };
  const angle = (item.rotationDeg * Math.PI) / DEGREES_PER_HALF_TURN;
  const dx = point.x - item.position.x;
  const dy = point.y - item.position.y;
  const along = Math.abs(dx * Math.cos(angle) + dy * Math.sin(angle));
  const across = Math.abs(-dx * Math.sin(angle) + dy * Math.cos(angle));
  const halfWidth = Math.max(size.widthM * HALF, MIN_PICK_HALF_M);
  const halfDepth = Math.max(size.depthM * HALF, MIN_PICK_HALF_M);
  return along <= halfWidth && across <= halfDepth ? Math.hypot(dx, dy) : null;
}

function distanceToSegment(point: PlanePoint, from: PlanePoint, to: PlanePoint): number {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0 ? 0 : ((point.x - from.x) * dx + (point.y - from.y) * dy) / lengthSquared;
  const t = Math.min(Math.max(along, 0), 1);
  return Math.hypot(point.x - (from.x + t * dx), point.y - (from.y + t * dy));
}

/** Shortest distance from the point to a polyline. */
export function distanceToPolyline(point: PlanePoint, points: readonly PlanePoint[]): number {
  return points
    .slice(1)
    .reduce(
      (best, to, index) => Math.min(best, distanceToSegment(point, points[index] ?? to, to)),
      Infinity,
    );
}

function nearestItem(point: PlanePoint, document: DesignDocument, catalog: CatalogIndex) {
  const hits = document.items
    .map((item) => ({ item, distance: itemReach(item, catalog, point) }))
    .filter((hit): hit is { item: DesignItem; distance: number } => hit.distance !== null)
    .sort((a, b) => a.distance - b.distance);
  return hits[0]?.item;
}

/** The element under a ground point: items first, then paths, then areas. */
export function elementAt(
  point: PlanePoint,
  document: DesignDocument,
  catalog: CatalogIndex,
): ElementRef | null {
  const item = nearestItem(point, document, catalog);
  if (item !== undefined) {
    return item.locked
      ? { kind: 'item', id: item.id, locked: 'locked' }
      : { kind: 'item', id: item.id };
  }
  const path = document.paths.find(
    (entry) =>
      distanceToPolyline(point, entry.points) <= Math.max(entry.widthM * HALF, MIN_PICK_HALF_M),
  );
  if (path !== undefined) return { kind: 'path', id: path.id };
  const area = document.areas.find((entry) => polygonContains(entry.polygon, point));
  if (area === undefined) return null;
  return area.locked
    ? { kind: 'area', id: area.id, locked: 'locked' }
    : { kind: 'area', id: area.id };
}

function isSelectable(document: DesignDocument, ref: ElementRef): boolean {
  switch (ref.kind) {
    case 'item':
      return document.items.some((item) => item.id === ref.id && !item.locked);
    case 'path':
      return document.paths.some((path) => path.id === ref.id);
    case 'area':
      return document.areas.some((area) => area.id === ref.id && !area.locked);
  }
}

/** Locked items stay where the planner put them, so they never join a selection. */
export function selectableRefs(
  document: DesignDocument,
  refs: readonly ElementRef[],
): ElementRef[] {
  return refs
    .filter((ref) => isSelectable(document, ref))
    .map((ref) => ({ kind: ref.kind, id: ref.id }));
}
