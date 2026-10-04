import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { categoryCounts, countBreaches, featureShortfalls } from './counts.js';
import {
  designOf,
  itemAt,
  parametersWith,
  rectangle,
  type DesignParts,
} from './fixtures/design-builders.js';
import { designFootprints } from './footprints.js';
import { makeFlatHeightmap } from './heightmap.js';
import { gridOf } from './raster.js';

const grid = gridOf(makeFlatHeightmap({ width: 40, height: 40 }));
const footprintsOf = (parts: DesignParts) =>
  designFootprints({ document: designOf(parts), catalog: catalogIndex, grid });
const garden = (maxX: number) => ({
  id: 'garden',
  catalogId: 'community-garden',
  polygon: rectangle(0, 0, maxX, 9),
  locked: false,
});
const design = footprintsOf({
  items: [
    itemAt('b1', 'bench', 20, 20),
    itemAt('b2', 'bench', 25, 20),
    itemAt('t1', 'red-alder', 30, 30),
  ],
  paths: [
    {
      id: 'p',
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 1, y: 30 },
        { x: 9, y: 30 },
      ],
    },
  ],
  areas: [garden(12)],
});

describe('categoryCounts', () => {
  it('counts items, areas and paths by category', () => {
    const counts = categoryCounts(design);
    expect(Object.fromEntries(counts)).toEqual({ seating: 2, tree: 1, garden: 1, path: 1 });
  });
});

describe('countBreaches', () => {
  it('reports categories above the maximum or below the minimum', () => {
    const { counts: ranges } = parametersWith({
      counts: [
        { category: 'seating', max: 1 },
        { category: 'play', min: 1 },
        { category: 'tree', min: 1, max: 5 },
      ],
    });
    expect(countBreaches(categoryCounts(design), ranges)).toEqual([
      { category: 'seating', count: 2, min: undefined, max: 1 },
      { category: 'play', count: 0, min: 1, max: undefined },
    ]);
  });
});

describe('featureShortfalls', () => {
  const needsPlots = parametersWith().requiredFeatures;

  it('reports a garden with fewer plots than required', () => {
    // A 12 x 9 m garden fits 12 beds (see modules.test.ts); the demo asks for 20.
    expect(featureShortfalls(design, needsPlots)).toEqual([
      { feature: needsPlots[0], count: 1, plots: 12 },
    ]);
  });

  it('passes a garden large enough for the plots', () => {
    // 24 x 9 m: 13 beds across (0.6 + 13 * 1.8 = 24.0) and 2 rows, so 26 plots.
    expect(featureShortfalls(footprintsOf({ areas: [garden(24)] }), needsPlots)).toEqual([]);
  });

  it('reports a missing feature', () => {
    expect(featureShortfalls(footprintsOf({}), needsPlots)).toEqual([
      { feature: needsPlots[0], count: 0, plots: 0 },
    ]);
  });

  it('matches features by catalog id', () => {
    const { requiredFeatures } = parametersWith({
      requiredFeatures: [{ catalogId: 'bench', minCount: 3 }],
    });
    expect(featureShortfalls(design, requiredFeatures)).toEqual([
      { feature: requiredFeatures[0], count: 2, plots: 0 },
    ]);
  });
});

describe('countBreaches boundaries', () => {
  it('allows a count exactly at the maximum and flags one over it', () => {
    const { counts: ranges } = parametersWith({ counts: [{ category: 'seating', max: 2 }] });
    expect(countBreaches(new Map([['seating', 2]]), ranges)).toEqual([]);
    expect(countBreaches(new Map([['seating', 3]]), ranges)).toEqual([
      { category: 'seating', count: 3, min: undefined, max: 2 },
    ]);
  });
});
