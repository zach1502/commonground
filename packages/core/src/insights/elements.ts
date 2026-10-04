import type { CatalogIndex } from '../catalog/catalog.js';
import { pathEntryId } from '../metrics/footprints.js';
import type { Category } from '../schema/catalog.js';
import type { DesignDocument } from '../schema/design.js';

export interface ElementCategory {
  readonly category: Category;
  readonly locked: boolean;
}

/** The category of every item, path and area in the document that the catalog knows. */
export function elementCategories(
  document: DesignDocument,
  catalog: CatalogIndex,
): ElementCategory[] {
  const placed = [...document.items, ...document.areas].flatMap((element) => {
    const entry = catalog.get(element.catalogId);
    return entry === undefined ? [] : [{ category: entry.category, locked: element.locked }];
  });
  const paths = document.paths.flatMap((path) => {
    const entry = catalog.get(pathEntryId(path.surface));
    return entry === undefined ? [] : [{ category: entry.category, locked: false }];
  });
  return [...placed, ...paths];
}

/** How many elements of each category the document has, new ones only unless told otherwise. */
export function countByCategory(
  elements: readonly ElementCategory[],
  scope: 'new' | 'all',
): ReadonlyMap<Category, number> {
  const counts = new Map<Category, number>();
  elements
    .filter((element) => scope === 'all' || !element.locked)
    .forEach(({ category }) => counts.set(category, (counts.get(category) ?? 0) + 1));
  return counts;
}
