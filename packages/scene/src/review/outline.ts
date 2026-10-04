import type { CatalogIndex, DesignDocument, ElementRef, PlanePoint } from '@parkshape/core';

import { selectionRingRadiusM } from '../editor/overlay-style.js';
import { footprintCorners } from '../editor/overlays.js';

/** One ground line of the selection outline. */
export interface OutlineLine {
  readonly points: readonly PlanePoint[];
  readonly closed: 'closed' | 'open';
}

const RING_POINTS = 32;
const FULL_TURN = Math.PI + Math.PI;
const UNKNOWN_SIZE = { widthM: 1, depthM: 1 };

function ringAround(centre: PlanePoint, radiusM: number): PlanePoint[] {
  return Array.from({ length: RING_POINTS }, (_, index) => {
    const angle = (index / RING_POINTS) * FULL_TURN;
    return { x: centre.x + Math.cos(angle) * radiusM, y: centre.y + Math.sin(angle) * radiusM };
  });
}

function itemOutline(design: DesignDocument, catalog: CatalogIndex, id: string): OutlineLine[] {
  const item = design.items.find((entry) => entry.id === id);
  if (item === undefined) return [];
  const entry = catalog.get(item.catalogId);
  const size = entry?.geometryKind === 'point' ? entry.footprint : UNKNOWN_SIZE;
  return [
    { points: footprintCorners(item.position, size, item.rotationDeg), closed: 'closed' },
    { points: ringAround(item.position, selectionRingRadiusM(size)), closed: 'closed' },
  ];
}

/**
 * The editor's selection outline for one element: an item's footprint and the ring around it,
 * a path's centre line, or an area's edge.
 */
export function selectionOutline(
  design: DesignDocument,
  catalog: CatalogIndex,
  ref: ElementRef,
): OutlineLine[] {
  if (ref.elementKind === 'item') return itemOutline(design, catalog, ref.elementId);
  if (ref.elementKind === 'path') {
    const path = design.paths.find((entry) => entry.id === ref.elementId);
    return path === undefined ? [] : [{ points: path.points, closed: 'open' }];
  }
  const area = design.areas.find((entry) => entry.id === ref.elementId);
  return area === undefined ? [] : [{ points: area.polygon, closed: 'closed' }];
}
