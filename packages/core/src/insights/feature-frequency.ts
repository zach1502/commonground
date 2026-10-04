import type { CatalogIndex } from '../catalog/catalog.js';
import { PERCENT_SCALE } from '../constants.js';
import { categorySchema, type Category } from '../schema/catalog.js';

import { countByCategory, elementCategories } from './elements.js';
import type { InsightDesign } from './types.js';

export interface FeatureFrequency {
  readonly category: Category;
  /** Percent of designs with at least one new element of the category. */
  readonly designsWithPercent: number;
  /** New elements of the category per design, on average. */
  readonly averageCount: number;
}

/** Locked elements are existing site features, so only what residents added is counted. */
export function featureFrequency(
  designs: readonly InsightDesign[],
  catalog: CatalogIndex,
): FeatureFrequency[] {
  const counts = designs.map((design) =>
    countByCategory(elementCategories(design.document, catalog), 'new'),
  );
  const share = (value: number) => (designs.length === 0 ? 0 : value / designs.length);
  return categorySchema.options.map((category) => {
    const perDesign = counts.map((count) => count.get(category) ?? 0);
    const withAny = perDesign.filter((count) => count > 0).length;
    const total = perDesign.reduce((sum, count) => sum + count, 0);
    return {
      category,
      designsWithPercent: share(withAny) * PERCENT_SCALE,
      averageCount: share(total),
    };
  });
}
