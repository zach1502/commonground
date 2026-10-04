import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { computeMetrics, type MetricsInput } from './compute.js';
import {
  designOf,
  parametersWith,
  rectangle,
  rectangleParcel,
  type ItemInput,
} from './fixtures/design-builders.js';
import { makeRampHeightmap } from './heightmap.js';

const SIZE = 30;
const RUNS = 25;
const itemIds = ['red-alder', 'garry-oak', 'bench', 'picnic-table', 'drinking-fountain', 'swings'];

const itemArbitrary = fc.record({
  catalogId: fc.constantFrom(...itemIds),
  x: fc.double({ min: 0, max: SIZE, noNaN: true }),
  y: fc.double({ min: 0, max: SIZE, noNaN: true }),
  rotationDeg: fc.integer({ min: 0, max: 359 }),
  locked: fc.boolean(),
});

const itemsArbitrary = fc.array(itemArbitrary, { maxLength: 8 }).map((drafts): ItemInput[] =>
  drafts.map((draft, index) => ({
    id: `item-${String(index)}`,
    catalogId: draft.catalogId,
    position: { x: draft.x, y: draft.y },
    rotationDeg: draft.rotationDeg,
    locked: draft.locked,
  })),
);

function inputWith(items: readonly ItemInput[]): MetricsInput {
  return {
    document: designOf({
      items,
      areas: [
        {
          id: 'garden',
          catalogId: 'community-garden',
          polygon: rectangle(1, 1, 25, 10),
          locked: false,
        },
      ],
      paths: [
        {
          id: 'p',
          surface: 'asphalt',
          widthM: 2,
          points: [
            { x: 2, y: 20 },
            { x: 28, y: 25 },
          ],
        },
      ],
      cells: [{ x: 5, y: 15, deltaM: 0.4 }],
    }),
    parcel: rectangleParcel(SIZE, SIZE),
    parameters: parametersWith(),
    catalog: catalogIndex,
    heightmap: makeRampHeightmap({ width: SIZE, height: SIZE, gradeX: 0.03, gradeY: 0.01 }),
  };
}

describe('computeMetrics properties', () => {
  it('does not depend on the order items were placed in', () => {
    const shuffled = itemsArbitrary.chain((items) =>
      fc.tuple(fc.constant(items), fc.shuffledSubarray(items, { minLength: items.length })),
    );
    fc.assert(
      fc.property(shuffled, ([items, reordered]) => {
        expect(computeMetrics(inputWith(reordered))).toEqual(computeMetrics(inputWith(items)));
      }),
      { numRuns: RUNS },
    );
  });

  it('keeps canopy and cover percents between 0 and 100', () => {
    fc.assert(
      fc.property(itemsArbitrary, (items) => {
        const result = computeMetrics(inputWith(items));
        if (!result.ok) throw new Error('valid input was rejected');
        const { canopyPercent, imperviousPercent } = result.value.totals;
        expect(canopyPercent).toBeGreaterThanOrEqual(0);
        expect(canopyPercent).toBeLessThanOrEqual(100);
        expect(imperviousPercent).toBeLessThanOrEqual(100);
      }),
      { numRuns: RUNS },
    );
  });

  it('gives the same report for the same input', () => {
    fc.assert(
      fc.property(itemsArbitrary, (items) => {
        expect(computeMetrics(inputWith(items))).toEqual(computeMetrics(inputWith(items)));
      }),
      { numRuns: RUNS },
    );
  });
});
