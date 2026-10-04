import { describe, expect, it } from 'vitest';

import { catalogItemSchema, type CatalogItemInput } from './catalog.js';
import { countRangeSchema } from './parameters.js';

const bench: CatalogItemInput = {
  id: 'bench',
  category: 'seating',
  name: 'Bench',
  geometryKind: 'point',
  footprint: { widthM: 1.8, depthM: 0.6 },
  heightM: 0.9,
  unitCost: { perItemCad: 3500 },
  surface: 'pervious',
  modelKey: 'bench',
  scalePolicy: 'fixed',
};

const lawn: CatalogItemInput = {
  ...bench,
  id: 'lawn',
  category: 'ground',
  name: 'Lawn',
  geometryKind: 'area',
  footprint: { minAreaM2: 100, defaultAreaM2: 200 },
  unitCost: { perM2Cad: 12 },
};

function issuesOf(input: unknown): { code: string; message: string; path: PropertyKey[] }[] {
  const result = catalogItemSchema.safeParse(input);
  if (result.success) return [];
  return result.error.issues.map(({ code, message, path }) => ({ code, message, path }));
}

describe('catalogItemSchema rule issues', () => {
  it('reports a crown radius on a bench against the id field', () => {
    expect(issuesOf({ ...bench, crownRadiusMatureM: 2 })).toEqual([
      {
        code: 'custom',
        message: 'Trees, and only trees, have crownRadiusMatureM',
        path: ['id'],
      },
    ]);
  });

  it('names the trunk diameter rule', () => {
    expect(issuesOf({ ...bench, matureDbhCm: 20 }).map((issue) => issue.message)).toEqual([
      'Trees, and only trees, have matureDbhCm',
    ]);
  });

  it('names the point-only rule for trees', () => {
    const areaTree = { ...lawn, category: 'tree', crownRadiusMatureM: 5, matureDbhCm: 40 };
    expect(issuesOf(areaTree).map((issue) => issue.message)).toEqual(['Trees are point items']);
  });

  it('names the minimum area rule', () => {
    const small = { ...lawn, footprint: { minAreaM2: 100, defaultAreaM2: 99.9 } };
    expect(issuesOf(small).map((issue) => issue.message)).toEqual([
      'defaultAreaM2 is below minAreaM2',
    ]);
  });

  it('names the plots rule', () => {
    expect(issuesOf({ ...lawn, plots: 4 }).map((issue) => issue.message)).toEqual([
      'Only items with a module have plots',
    ]);
  });

  it('asks for at least one unit cost on the unitCost field', () => {
    expect(issuesOf({ ...bench, unitCost: {} })).toEqual([
      { code: 'custom', message: 'Give at least one unit cost', path: ['unitCost'] },
    ]);
  });
});

describe('countRangeSchema issues', () => {
  it('says min is above max when min is 3 and max is 2', () => {
    const result = countRangeSchema.safeParse({ category: 'seating', min: 3, max: 2 });
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toEqual(['min is above max']);
  });
});
