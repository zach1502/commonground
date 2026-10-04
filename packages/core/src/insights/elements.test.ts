import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import { designOf, itemAt, rectangle } from '../metrics/fixtures/design-builders.js';

import { countByCategory, elementCategories } from './elements.js';

describe('elementCategories', () => {
  it('leaves out items, areas and paths the catalog does not know', () => {
    const document = designOf({
      items: [itemAt('x', 'not-in-catalog', 1, 1)],
      areas: [
        { id: 'y', catalogId: 'not-in-catalog', polygon: rectangle(0, 0, 2, 2), locked: false },
      ],
      paths: [
        {
          id: 'z',
          surface: 'gravel',
          widthM: 2,
          points: [
            { x: 0, y: 5 },
            { x: 5, y: 5 },
          ],
        },
      ],
    });
    const withoutPaths = new Map([...catalogIndex].filter(([id]) => !id.startsWith('path-')));
    expect(elementCategories(document, withoutPaths)).toEqual([]);
  });
});

describe('countByCategory', () => {
  const elements = [
    { category: 'tree', locked: true },
    { category: 'tree', locked: false },
    { category: 'seating', locked: false },
  ] as const;

  it('counts locked elements too when asked for all of them', () => {
    expect(Object.fromEntries(countByCategory(elements, 'all'))).toEqual({ tree: 2, seating: 1 });
  });

  it('counts only new elements otherwise', () => {
    expect(Object.fromEntries(countByCategory(elements, 'new'))).toEqual({ tree: 1, seating: 1 });
  });
});
