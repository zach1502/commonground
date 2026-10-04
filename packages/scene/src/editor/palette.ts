import type { CatalogItem, Category } from '@parkshape/core';

/** The picker's tabs. Each holds one or more catalog categories, so no tab is nearly empty. */
export type PaletteGroupId = 'plants' | 'paths' | 'play' | 'seating' | 'garden' | 'amenities';

export const PALETTE_GROUPS: readonly {
  readonly id: PaletteGroupId;
  readonly categories: readonly Category[];
}[] = [
  { id: 'plants', categories: ['tree', 'shrub'] },
  { id: 'paths', categories: ['path', 'ground', 'plaza', 'parking'] },
  { id: 'play', categories: ['play', 'sports'] },
  { id: 'seating', categories: ['seating'] },
  { id: 'garden', categories: ['garden', 'water', 'dog'] },
  { id: 'amenities', categories: ['amenity', 'lighting', 'washroom'] },
];

export interface PaletteGroup {
  readonly group: PaletteGroupId;
  readonly entries: readonly CatalogItem[];
}

/** Catalog entries by picker tab, in catalog order within each tab. Empty tabs are left out. */
export function paletteGroups(catalog: readonly CatalogItem[]): PaletteGroup[] {
  return PALETTE_GROUPS.map(({ id, categories }) => ({
    group: id,
    entries: catalog.filter((entry) => categories.includes(entry.category)),
  })).filter((group) => group.entries.length > 0);
}

export interface PaletteCost {
  readonly amountCad: number;
  readonly unit: 'item' | 'm2' | 'module';
}

/** The unit cost a tile shows: per item, else per square metre, else per plot. */
export function paletteCost(entry: CatalogItem | undefined): PaletteCost | null {
  const cost = entry?.unitCost;
  if (cost?.perItemCad !== undefined) return { amountCad: cost.perItemCad, unit: 'item' };
  if (cost?.perM2Cad !== undefined) return { amountCad: cost.perM2Cad, unit: 'm2' };
  if (cost?.perModuleCad !== undefined) return { amountCad: cost.perModuleCad, unit: 'module' };
  return null;
}

/**
 * The tile an arrow, Home or End key moves to in a grid read left to right, top to bottom. The
 * focus stops at the edges, as in a listbox. Other keys give null.
 */
export function gridMove(
  index: number,
  key: string,
  count: number,
  columns: number,
): number | null {
  const last = count - 1;
  const steps: Readonly<Record<string, number>> = {
    ArrowLeft: index - 1,
    ArrowRight: index + 1,
    ArrowUp: index - columns,
    ArrowDown: index + columns,
    Home: 0,
    End: last,
  };
  const next = steps[key];
  if (next === undefined) return null;
  return next < 0 || next > last ? index : next;
}
