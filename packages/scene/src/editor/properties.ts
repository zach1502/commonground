import type { CatalogIndex, Category, DesignDocument, PathSurface } from '@parkshape/core';

import { areaSummary } from './area-tool.js';
import type { ElementRef } from './types.js';

export type Properties =
  | { readonly kind: 'none' }
  | { readonly kind: 'many'; readonly count: number }
  | {
      readonly kind: 'item';
      readonly id: string;
      readonly catalogId: string;
      readonly category: Category;
      /** The catalog's price for one, in Canadian dollars. */
      readonly costCad: number;
      readonly x: number;
      readonly y: number;
      readonly rotationDeg: number;
    }
  | {
      readonly kind: 'area';
      readonly id: string;
      readonly catalogId: string;
      readonly areaM2: number;
      readonly plots: number;
      readonly minAreaM2: number;
    }
  | {
      readonly kind: 'path';
      readonly id: string;
      readonly surface: PathSurface;
      readonly lengthM: number;
      readonly points: number;
    };

const NONE: Properties = { kind: 'none' };

function itemProperties(document: DesignDocument, id: string, catalog: CatalogIndex): Properties {
  const item = document.items.find((entry) => entry.id === id);
  const entry = item === undefined ? undefined : catalog.get(item.catalogId);
  if (item === undefined || entry === undefined) return NONE;
  const { x, y } = item.position;
  const { category } = entry;
  const costCad = entry.unitCost.perItemCad ?? 0;
  const { catalogId, rotationDeg } = item;
  return { kind: 'item', id, catalogId, category, costCad, x, y, rotationDeg };
}

function areaProperties(document: DesignDocument, id: string, catalog: CatalogIndex): Properties {
  const area = document.areas.find((entry) => entry.id === id);
  const entry = area === undefined ? undefined : catalog.get(area.catalogId);
  if (area === undefined || entry?.geometryKind !== 'area') return NONE;
  const { areaM2, plots, minAreaM2 } = areaSummary(entry, area.polygon);
  return { kind: 'area', id, catalogId: area.catalogId, areaM2, plots, minAreaM2 };
}

function pathProperties(document: DesignDocument, id: string): Properties {
  const path = document.paths.find((entry) => entry.id === id);
  if (path === undefined) return NONE;
  const lengthM = path.points.slice(1).reduce((total, to, index) => {
    const from = path.points[index] ?? to;
    return total + Math.hypot(to.x - from.x, to.y - from.y);
  }, 0);
  return { kind: 'path', id, surface: path.surface, lengthM, points: path.points.length };
}

/** What the properties panel shows for the current selection. */
export function propertiesOf(
  document: DesignDocument,
  selection: readonly ElementRef[],
  catalog: CatalogIndex,
): Properties {
  const [only, ...others] = selection;
  if (only === undefined) return NONE;
  if (others.length > 0) return { kind: 'many', count: selection.length };
  switch (only.kind) {
    case 'item':
      return itemProperties(document, only.id, catalog);
    case 'area':
      return areaProperties(document, only.id, catalog);
    case 'path':
      return pathProperties(document, only.id);
  }
}
