import type { DesignDocument } from '@parkshape/core';

import type { ElementKind, ElementRef } from './types.js';

export interface ItemsListRow {
  readonly kind: ElementKind;
  readonly id: string;
  /** Names the row through the catalog strings; paths use their surface entry. */
  readonly catalogId: string;
  /** Item position, or the first point of a path or area. */
  readonly x: number;
  readonly y: number;
  readonly locked: 'locked' | 'free';
  readonly selected: 'selected' | 'not-selected';
}

/** Every element in the design, for the Items list that stands in for the canvas. */
export function itemsListRows(
  document: DesignDocument,
  selection: readonly ElementRef[],
): ItemsListRow[] {
  const selected = (id: string) =>
    selection.some((ref) => ref.id === id) ? ('selected' as const) : ('not-selected' as const);
  return [
    ...document.items.map((item) => ({
      kind: 'item' as const,
      id: item.id,
      catalogId: item.catalogId,
      x: item.position.x,
      y: item.position.y,
      locked: item.locked ? ('locked' as const) : ('free' as const),
      selected: selected(item.id),
    })),
    ...document.paths.map((path) => ({
      kind: 'path' as const,
      id: path.id,
      catalogId: `path-${path.surface}`,
      x: path.points[0].x,
      y: path.points[0].y,
      locked: 'free' as const,
      selected: selected(path.id),
    })),
    ...document.areas.map((area) => ({
      kind: 'area' as const,
      id: area.id,
      catalogId: area.catalogId,
      x: area.polygon[0].x,
      y: area.polygon[0].y,
      locked: area.locked ? ('locked' as const) : ('free' as const),
      selected: selected(area.id),
    })),
  ];
}
