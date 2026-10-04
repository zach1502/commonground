import type { CatalogIndex, DesignDocument, PlanePoint } from '@parkshape/core';

import type { Tool } from './store/types.js';
import type { ElementRef } from './types.js';

const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;

export interface Outline {
  readonly id: string;
  readonly polygon: readonly PlanePoint[];
}

/** Corners of an item's footprint rectangle, turned by its rotation. */
export function footprintCorners(
  centre: PlanePoint,
  size: { readonly widthM: number; readonly depthM: number },
  rotationDeg: number,
): PlanePoint[] {
  const angle = (rotationDeg * Math.PI) / DEGREES_PER_HALF_TURN;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const w = size.widthM * HALF;
  const d = size.depthM * HALF;
  return [
    [-w, -d],
    [w, -d],
    [w, d],
    [-w, d],
  ].map(([u = 0, v = 0]) => ({ x: centre.x + u * cos - v * sin, y: centre.y + u * sin + v * cos }));
}

/** Footprints of locked items and areas, drawn as blocked ground while placing. */
export function lockedOutlines(document: DesignDocument, catalog: CatalogIndex): Outline[] {
  const items = document.items.flatMap((item) => {
    const entry = catalog.get(item.catalogId);
    if (!item.locked || entry?.geometryKind !== 'point') return [];
    return [
      { id: item.id, polygon: footprintCorners(item.position, entry.footprint, item.rotationDeg) },
    ];
  });
  const areas = document.areas
    .filter((area) => area.locked)
    .map((area) => ({ id: area.id, polygon: area.polygon }));
  return [...items, ...areas];
}

const average = (points: readonly PlanePoint[]): PlanePoint => ({
  x: points.reduce((total, point) => total + point.x, 0) / points.length,
  y: points.reduce((total, point) => total + point.y, 0) / points.length,
});

function centreOf(document: DesignDocument, ref: ElementRef): PlanePoint[] {
  switch (ref.kind) {
    case 'item':
      return document.items.filter((item) => item.id === ref.id).map((item) => item.position);
    case 'path':
      return document.paths
        .filter((path) => path.id === ref.id)
        .map((path) => average(path.points));
    case 'area':
      return document.areas
        .filter((area) => area.id === ref.id)
        .map((area) => average(area.polygon));
  }
}

/** Where the floating toolbar sits: the middle of the selected elements. */
export function selectionAnchor(
  document: DesignDocument,
  selection: readonly ElementRef[],
): PlanePoint | null {
  const centres = selection.flatMap((ref) => centreOf(document, ref));
  return centres.length === 0 ? null : average(centres);
}

/**
 * The floating toolbar's anchor, or null while a drawing or placing tool is active: the toolbar
 * would otherwise sit over the ground and take the clicks meant for a path point or an item.
 */
export function toolbarAnchor(
  document: DesignDocument,
  selection: readonly ElementRef[],
  tool: Tool,
): PlanePoint | null {
  return tool.kind === 'select' ? selectionAnchor(document, selection) : null;
}
