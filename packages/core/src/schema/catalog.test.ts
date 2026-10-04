import { describe, expect, it } from 'vitest';

import {
  catalogItemSchema,
  categorySchema,
  geometryKindSchema,
  moduleKitItemSchema,
  projectStatusSchema,
  type CatalogItemInput,
} from './catalog.js';

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

const tree: CatalogItemInput = {
  ...bench,
  id: 'garry-oak',
  category: 'tree',
  name: 'Garry oak',
  footprint: { widthM: 0.6, depthM: 0.6 },
  heightM: 15,
  crownRadiusMatureM: 7,
  matureDbhCm: 60,
  modelKey: 'tree-garry-oak',
};

const garden: CatalogItemInput = {
  id: 'community-garden',
  category: 'garden',
  name: 'Community garden',
  geometryKind: 'area',
  footprint: {
    minAreaM2: 40,
    defaultAreaM2: 160,
    module: { kind: 'raised-bed', widthM: 1.2, depthM: 3, aisleM: 0.6 },
    perimeter: { postSpacingM: 2.4, gateCount: 1 },
  },
  heightM: 0.5,
  unitCost: { perModuleCad: 900 },
  surface: 'pervious',
  modelKey: 'community-garden',
  scalePolicy: 'tile',
  plots: 24,
};

describe('catalogItemSchema', () => {
  it('parses point, tree and area items', () => {
    expect(catalogItemSchema.parse(bench)).toEqual(bench);
    expect(catalogItemSchema.parse(tree)).toEqual(tree);
    expect(catalogItemSchema.parse(garden)).toEqual(garden);
  });

  it('parses a linear item with a width only', () => {
    const path = {
      ...bench,
      id: 'path-gravel',
      category: 'path',
      geometryKind: 'linear',
      footprint: { widthM: 2 },
      scalePolicy: 'segment',
    };
    expect(catalogItemSchema.safeParse(path).success).toBe(true);
    expect(
      catalogItemSchema.safeParse({ ...path, footprint: { widthM: 2, depthM: 1 } }).success,
    ).toBe(false);
  });

  it('rejects negative or zero widths', () => {
    expect(
      catalogItemSchema.safeParse({ ...bench, footprint: { widthM: -1, depthM: 0.6 } }).success,
    ).toBe(false);
    expect(
      catalogItemSchema.safeParse({ ...bench, footprint: { widthM: 1, depthM: 0 } }).success,
    ).toBe(false);
  });
});

describe('catalogItemSchema rules', () => {
  it('requires a mature crown radius on trees and only on trees', () => {
    const treeWithoutCrown = Object.fromEntries(
      Object.entries(tree).filter(([key]) => key !== 'crownRadiusMatureM'),
    );
    expect(catalogItemSchema.safeParse(treeWithoutCrown).success).toBe(false);
    expect(catalogItemSchema.safeParse({ ...bench, crownRadiusMatureM: 2 }).success).toBe(false);
  });

  it('requires a mature trunk diameter on trees and only on trees', () => {
    const treeWithoutDbh = Object.fromEntries(
      Object.entries(tree).filter(([key]) => key !== 'matureDbhCm'),
    );
    expect(catalogItemSchema.safeParse(treeWithoutDbh).success).toBe(false);
    expect(catalogItemSchema.safeParse({ ...bench, matureDbhCm: 20 }).success).toBe(false);
  });

  it('requires trees to be point items', () => {
    expect(
      catalogItemSchema.safeParse({
        ...garden,
        category: 'tree',
        crownRadiusMatureM: 5,
        matureDbhCm: 40,
        plots: undefined,
      }).success,
    ).toBe(false);
  });

  it('rejects a default area smaller than the minimum area', () => {
    const footprint = { minAreaM2: 100, defaultAreaM2: 50 };
    expect(catalogItemSchema.safeParse({ ...garden, footprint, plots: undefined }).success).toBe(
      false,
    );
  });

  it('allows plots only on items with a module', () => {
    const footprint = { minAreaM2: 40, defaultAreaM2: 160 };
    expect(catalogItemSchema.safeParse({ ...garden, footprint }).success).toBe(false);
  });

  it('rejects an item with no unit cost', () => {
    expect(catalogItemSchema.safeParse({ ...bench, unitCost: {} }).success).toBe(false);
  });

  it('rejects a gate count other than 0 or 1', () => {
    const footprint = { ...garden.footprint, perimeter: { postSpacingM: 2.4, gateCount: 2 } };
    expect(catalogItemSchema.safeParse({ ...garden, footprint }).success).toBe(false);
  });
});

describe('moduleKitItemSchema', () => {
  it('parses a fixed-size kit part and rejects unknown scale policies', () => {
    const post = {
      id: 'fence-post',
      name: 'Fence post',
      widthM: 0.1,
      depthM: 0.1,
      heightM: 1.2,
      modelKey: 'kit-fence-post',
      scalePolicy: 'fixed',
    };
    expect(moduleKitItemSchema.parse(post)).toEqual(post);
    expect(moduleKitItemSchema.safeParse({ ...post, scalePolicy: 'stretch' }).success).toBe(false);
  });
});

describe('catalog enums', () => {
  it('names exactly the three geometry kinds the item union parses', () => {
    const path = {
      ...bench,
      id: 'path-gravel',
      category: 'path',
      geometryKind: 'linear',
      footprint: { widthM: 2 },
    };
    const examples: Record<string, unknown> = { point: bench, linear: path, area: garden };
    const parsed = geometryKindSchema.options.map(
      (kind) => catalogItemSchema.safeParse(examples[kind]).success,
    );
    expect(parsed).toEqual([true, true, true]);
  });

  it('accepts impervious and water surfaces', () => {
    expect(catalogItemSchema.safeParse({ ...bench, surface: 'impervious' }).success).toBe(true);
    expect(catalogItemSchema.safeParse({ ...bench, surface: 'water' }).success).toBe(true);
  });

  it('accepts each of the 15 park categories', () => {
    const categories = [
      'tree',
      'shrub',
      'path',
      'water',
      'play',
      'seating',
      'sports',
      'garden',
      'dog',
      'lighting',
      'washroom',
      'parking',
      'ground',
      'plaza',
      'amenity',
    ];
    expect(categories.filter((category) => !categorySchema.safeParse(category).success)).toEqual(
      [],
    );
  });

  it('takes open and closed as project statuses and nothing else', () => {
    expect(projectStatusSchema.safeParse('open').success).toBe(true);
    expect(projectStatusSchema.safeParse('closed').success).toBe(true);
    expect(projectStatusSchema.safeParse('paused').success).toBe(false);
  });
});

describe('catalogItemSchema bounds', () => {
  it('rejects a unit cost whose only price is explicitly undefined', () => {
    expect(
      catalogItemSchema.safeParse({ ...bench, unitCost: { perItemCad: undefined } }).success,
    ).toBe(false);
  });

  it('accepts a default area equal to the minimum area', () => {
    const footprint = { ...garden.footprint, minAreaM2: 160, defaultAreaM2: 160 };
    expect(catalogItemSchema.safeParse({ ...garden, footprint }).success).toBe(true);
  });
});
