import type { CatalogItem, DesignDocument, Random } from '@parkshape/core';

/** New element ids look like item-k3f9x2; six base-36 digits. */
const ID_DIGITS = 6;
const RADIX = 36;
const ID_SPACE = RADIX ** ID_DIGITS;
// Trees vary in size within 10 percent (DESIGN.md), the range the schema accepts.
const TREE_SCALE_MIN = 0.9;
const TREE_SCALE_SPAN = 0.2;
const SCALE_DECIMALS = 1000;

export type IdPrefix = 'item' | 'path' | 'area' | 'zone';

function takenIds(document: DesignDocument): Set<string> {
  return new Set([
    ...document.items.map((item) => item.id),
    ...document.paths.map((path) => path.id),
    ...document.areas.map((area) => area.id),
    ...document.zones.map((zone) => zone.id),
  ]);
}

/** A fresh id from the injected random source, never one the document already uses. */
export function newElementId(prefix: IdPrefix, random: Random, document: DesignDocument): string {
  const taken = takenIds(document);
  for (;;) {
    const digits = Math.floor(random.next() * ID_SPACE)
      .toString(RADIX)
      .padStart(ID_DIGITS, '0');
    const id = `${prefix}-${digits}`;
    if (!taken.has(id)) return id;
  }
}

export function treeScaleJitter(random: Random): number {
  return (
    Math.round((TREE_SCALE_MIN + random.next() * TREE_SCALE_SPAN) * SCALE_DECIMALS) / SCALE_DECIMALS
  );
}

export const isTree = (entry: CatalogItem | undefined) => entry?.category === 'tree';
