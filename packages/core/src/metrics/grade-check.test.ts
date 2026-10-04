import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { designOf, itemAt, rectangle, type DesignParts } from './fixtures/design-builders.js';
import { designFootprints } from './footprints.js';
import { measureFootprintGrades } from './grade-check.js';
import { makeRampHeightmap } from './heightmap.js';
import { gridOf } from './raster.js';

const measureOn = (gradeX: number, parts: DesignParts) => {
  const heightmap = makeRampHeightmap({ width: 60, height: 60, gradeX });
  const footprints = designFootprints({
    document: designOf(parts),
    catalog: catalogIndex,
    grid: gridOf(heightmap),
  });
  return measureFootprintGrades(heightmap, footprints);
};

describe('measureFootprintGrades', () => {
  it('reports the steepest grade under an item with a grade limit', () => {
    const [grade] = measureOn(0.08, { items: [itemAt('play', 'playground-structure', 30, 30)] });
    expect(grade?.id).toBe('play');
    expect(grade?.grade).toBeCloseTo(0.08, 4);
    expect(grade?.limit).toBe(0.05);
  });

  it('checks areas by their polygon', () => {
    const [grade] = measureOn(0.03, {
      areas: [
        { id: 'plaza', catalogId: 'plaza', polygon: rectangle(10, 10, 20, 20), locked: false },
      ],
    });
    expect(grade?.grade).toBeCloseTo(0.03, 4);
    expect(grade?.limit).toBe(0.02);
  });

  it('skips items without a grade limit and locked items', () => {
    const locked = { ...itemAt('wc', 'washroom-building', 30, 30), locked: true };
    expect(measureOn(0.08, { items: [itemAt('b', 'bench', 5, 5), locked] })).toEqual([]);
  });
});

describe('measureFootprintGrades on a north-south ramp', () => {
  it('reads the grade from the rows the footprint covers', () => {
    const heightmap = makeRampHeightmap({ width: 60, height: 60, gradeY: 0.08 });
    const footprints = designFootprints({
      document: designOf({ items: [itemAt('play', 'playground-structure', 30, 30)] }),
      catalog: catalogIndex,
      grid: gridOf(heightmap),
    });
    expect(measureFootprintGrades(heightmap, footprints)[0]?.grade).toBeCloseTo(0.08, 4);
  });

  it('skips an existing area, which is the park as it is today', () => {
    const plaza = {
      id: 'plaza',
      catalogId: 'plaza',
      polygon: rectangle(10, 10, 20, 20),
      locked: false,
    };
    expect(measureOn(0.03, { areas: [{ ...plaza, existing: true }] })).toEqual([]);
  });
});
