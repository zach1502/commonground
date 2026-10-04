import { z } from 'zod';

import type { CatalogIndex } from '../catalog/catalog.js';
import type { CatalogItem, PathSurface } from '../schema/catalog.js';
import type { DesignArea, DesignDocument, DesignItem, DesignPath } from '../schema/design.js';
import { polygonArea } from '../schema/geometry.js';
import { catalogIdSchema, type CatalogId, type ItemId } from '../schema/ids.js';

import { areaPlotCount } from './plots.js';
import {
  areaM2,
  rasterizeOrientedRect,
  rasterizePolygon,
  rasterizeRibbon,
  type Grid,
  type Mask,
} from './raster.js';

/** The kinds of design element a footprint or an element comment points at. */
export const elementKindSchema = z.enum(['item', 'path', 'area']);

export type ElementKind = z.infer<typeof elementKindSchema>;

/** Where one design element sits on the grid, with what the metrics need to know about it. */
export interface Footprint {
  readonly id: ItemId;
  readonly kind: ElementKind;
  /** Catalog name, or "Path N" for paths, for use in messages. Never an id. */
  readonly label: string;
  readonly locked: boolean;
  /** Part of the park as it is today and unedited, so grade limits do not apply. */
  readonly existing: boolean;
  readonly entry: CatalogItem;
  readonly mask: Mask;
  /** Exact area for items and areas; covered cells for paths, so corners count once. */
  readonly areaM2: number;
  readonly moduleCount: number;
}

export interface FootprintInput {
  readonly document: DesignDocument;
  readonly catalog: CatalogIndex;
  readonly grid: Grid;
  /** The park as it is today; an existing garden kept unchanged counts its recorded plots. */
  readonly baselineAreas?: readonly DesignArea[] | undefined;
}

/** Catalog id of the entry a drawn path takes its cost and surface from. */
export function pathEntryId(surface: PathSurface): CatalogId {
  return catalogIdSchema.parse(`path-${surface}`);
}

function itemFootprint(item: DesignItem, catalog: CatalogIndex, grid: Grid): Footprint[] {
  const entry = catalog.get(item.catalogId);
  if (entry?.geometryKind !== 'point') return [];
  const { widthM, depthM } = entry.footprint;
  const rect = { centre: item.position, widthM, depthM, rotationDeg: item.rotationDeg };
  return [
    {
      id: item.id,
      kind: 'item',
      label: entry.name,
      locked: item.locked,
      existing: false,
      entry,
      mask: rasterizeOrientedRect(grid, rect),
      areaM2: widthM * depthM,
      moduleCount: 0,
    },
  ];
}

function areaFootprint(area: DesignArea, input: FootprintInput): Footprint[] {
  const { catalog, grid } = input;
  const entry = catalog.get(area.catalogId);
  if (entry?.geometryKind !== 'area') return [];
  return [
    {
      id: area.id,
      kind: 'area',
      label: entry.name,
      locked: area.locked,
      existing: area.existing === true,
      entry,
      mask: rasterizePolygon(grid, area.polygon),
      areaM2: polygonArea(area.polygon),
      moduleCount: areaPlotCount(entry, area, input.baselineAreas ?? []),
    },
  ];
}

function pathFootprint(path: DesignPath, index: number, input: FootprintInput): Footprint[] {
  const entry = input.catalog.get(pathEntryId(path.surface));
  if (entry === undefined) return [];
  const mask = rasterizeRibbon(input.grid, path.points, path.widthM);
  const number = index + 1;
  return [
    {
      id: path.id,
      kind: 'path',
      label: `Path ${String(number)}`,
      locked: false,
      existing: path.existing === true,
      entry,
      mask,
      areaM2: areaM2(mask),
      moduleCount: 0,
    },
  ];
}

const byId = <T extends { readonly id: string }>(a: T, b: T) => a.id.localeCompare(b.id);

/**
 * Footprints of every element: items and areas sorted by id, then paths in drawing order.
 * Sorting makes every metric independent of the order items were placed in.
 * Elements with a missing or mismatched catalog entry are left out.
 */
export function designFootprints(input: FootprintInput): Footprint[] {
  const { document, catalog, grid } = input;
  const placed = [
    ...document.items.flatMap((item) => itemFootprint(item, catalog, grid)),
    ...document.areas.flatMap((area) => areaFootprint(area, input)),
  ].sort(byId);
  const paths = document.paths.flatMap((path, index) => pathFootprint(path, index, input));
  return [...placed, ...paths];
}
