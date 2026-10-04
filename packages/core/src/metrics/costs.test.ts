import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { measureCosts } from './costs.js';
import { designOf, itemAt, parametersWith, rectangle } from './fixtures/design-builders.js';
import { designFootprints } from './footprints.js';
import { makeFlatHeightmap } from './heightmap.js';
import { gridOf } from './raster.js';

const grid = gridOf(makeFlatHeightmap({ width: 40, height: 40 }));
const rates = parametersWith().budget.earthworks;
const noEarthworks = { cut: 0, fill: 0, net: 0 };

const document = designOf({
  items: [
    itemAt('bench-new', 'bench', 30, 30),
    { ...itemAt('bench-old', 'bench', 30, 35), locked: true },
  ],
  paths: [
    {
      id: 'walk',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 2, y: 20 },
        { x: 12, y: 20 },
      ],
    },
  ],
  areas: [
    { id: 'lawn', catalogId: 'lawn', polygon: rectangle(20, 0, 30, 10), locked: false },
    { id: 'garden', catalogId: 'community-garden', polygon: rectangle(0, 0, 12, 9), locked: false },
  ],
});
const footprints = designFootprints({ document, catalog: catalogIndex, grid });

describe('measureCosts', () => {
  it('prices items, paths and areas and skips locked items', () => {
    const costs = measureCosts({ footprints, volumes: noEarthworks, rates });
    // Bench 3,500. Gravel ribbon 24 m2 at 45 is 1,080. Lawn 100 m2 at 15 is 1,500.
    // Garden: 12 beds at 900 is 10,800. The locked bench already exists, so it is free.
    expect(costs).toEqual({
      itemsCad: 3500,
      pathsCad: 1080,
      areasCad: 1500 + 10800,
      earthworksCad: 0,
      totalCad: 3500 + 1080 + 1500 + 10800,
    });
  });

  it('prices cut, fill and the net haul per cubic metre', () => {
    const costs = measureCosts({ footprints: [], volumes: { cut: 10, fill: 4, net: -6 }, rates });
    // 10 * 25 + 4 * 35 + 6 * 20.
    expect(costs.earthworksCad).toBe(250 + 140 + 120);
    expect(costs.totalCad).toBe(510);
  });
});
