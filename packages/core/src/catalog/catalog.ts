import { fitModules } from '../metrics/modules.js';
import {
  catalogItemSchema,
  type AreaCatalogItem,
  type CatalogItem,
  type CatalogItemInput,
} from '../schema/catalog.js';
import type { PlanePoint } from '../schema/geometry.js';

import { facilityItems } from './items/facilities.js';
import { fencedAreaItems } from './items/gardens.js';
import { pathItems } from './items/paths.js';
import { playItems } from './items/play.js';
import { seatingItems } from './items/seating.js';
import { shrubItems } from './items/shrubs.js';
import { sportsItems } from './items/sports.js';
import { surfaceItems } from './items/surfaces.js';
import { treeItems } from './items/trees.js';
import { waterItems } from './items/water.js';

const catalogInputs: readonly CatalogItemInput[] = [
  ...treeItems,
  ...shrubItems,
  ...pathItems,
  ...waterItems,
  ...playItems,
  ...seatingItems,
  ...sportsItems,
  ...fencedAreaItems,
  ...facilityItems,
  ...surfaceItems,
];

/** Every placeable item. Parsing at load means a bad entry fails on import, not in the editor. */
export const catalogItems: readonly CatalogItem[] = catalogItemSchema.array().parse(catalogInputs);

/** Keyed by plain string so unvalidated ids from a document can be looked up. */
export type CatalogIndex = ReadonlyMap<string, CatalogItem>;

export const catalogIndex: CatalogIndex = new Map(catalogItems.map((item) => [item.id, item]));

/**
 * Plots an area item's polygon holds: its modules fitted on a grid with an aisle on every side.
 * The metrics engine and the validate command both count plots with this, so they agree.
 */
export function modulePlotCount(item: AreaCatalogItem, polygon: readonly PlanePoint[]): number {
  const { module } = item.footprint;
  return module === undefined ? 0 : fitModules(polygon, module).count;
}
