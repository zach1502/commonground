import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import { itemAt, rectangle } from '../metrics/fixtures/design-builders.js';

import { featureFrequency } from './feature-frequency.js';
import { syntheticDesign } from './fixtures.js';

const designs = [
  syntheticDesign({
    id: 'a',
    parts: {
      items: [itemAt('t1', 'garry-oak', 2, 2), itemAt('t2', 'garry-oak', 5, 5)],
      paths: [
        {
          id: 'p1',
          surface: 'gravel',
          widthM: 2,
          points: [
            { x: 0, y: 0 },
            { x: 5, y: 0 },
          ],
        },
      ],
    },
  }),
  syntheticDesign({
    id: 'b',
    parts: {
      items: [itemAt('t1', 'garry-oak', 2, 2), itemAt('b1', 'bench', 3, 3)],
      areas: [
        { id: 'g1', catalogId: 'community-garden', polygon: rectangle(0, 0, 4, 4), locked: false },
      ],
    },
  }),
  syntheticDesign({
    id: 'c',
    parts: { items: [{ ...itemAt('old', 'garry-oak', 1, 1), locked: true }] },
  }),
];

describe('featureFrequency', () => {
  // Built inside each test, so a bug that throws fails that test instead of the whole file.
  const rows = () => featureFrequency(designs, catalogIndex);
  const row = (category: string) => rows().find((entry) => entry.category === category);

  it('gives the share of designs with at least one new element per category', () => {
    // Trees in a and b; c only keeps a locked tree, which does not count.
    expect(row('tree')?.designsWithPercent).toBeCloseTo((2 / 3) * 100);
    expect(row('path')?.designsWithPercent).toBeCloseTo((1 / 3) * 100);
    expect(row('garden')?.designsWithPercent).toBeCloseTo((1 / 3) * 100);
    expect(row('dog')?.designsWithPercent).toBe(0);
  });

  it('gives the average count of new elements per design', () => {
    expect(row('tree')?.averageCount).toBeCloseTo(3 / 3);
    expect(row('seating')?.averageCount).toBeCloseTo(1 / 3);
  });

  it('lists every catalog category once, in schema order', () => {
    expect(rows()[0]?.category).toBe('tree');
    expect(new Set(rows().map((entry) => entry.category)).size).toBe(rows().length);
  });

  it('reports zero for every category when there are no designs', () => {
    expect(featureFrequency([], catalogIndex).every((entry) => entry.averageCount === 0)).toBe(
      true,
    );
  });
});
