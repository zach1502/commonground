import { describe, expect, it } from 'vitest';

import { catalogItemSchema, type CatalogItem } from '../schema/catalog.js';
import type { PlanePoint } from '../schema/geometry.js';

import { catalogIndex, catalogItems, modulePlotCount } from './catalog.js';

const rectangle = (widthM: number, depthM: number): PlanePoint[] => [
  { x: 0, y: 0 },
  { x: widthM, y: 0 },
  { x: widthM, y: depthM },
  { x: 0, y: depthM },
];
const square = (sideM: number) => rectangle(sideM, sideM);

const byCategory = (category: CatalogItem['category']) =>
  catalogItems.filter((item) => item.category === category);

describe('catalogItems', () => {
  // The juice round added 8 models to the 34 items, so the bound moved from 40 to 45 by intent.
  it('has 33 to 45 items that each pass the schema', () => {
    expect(catalogItems.length).toBeGreaterThanOrEqual(33);
    expect(catalogItems.length).toBeLessThanOrEqual(45);
    catalogItems.forEach((item) => {
      expect(catalogItemSchema.parse(item)).toEqual(item);
    });
  });

  it('has unique ids and an index entry for each', () => {
    const ids = catalogItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(catalogIndex.size).toBe(ids.length);
  });

  it('gives every tree a mature crown radius from 3 to 9 m', () => {
    const trees = byCategory('tree');
    expect(trees).toHaveLength(7);
    trees.forEach((tree) => {
      expect(tree.crownRadiusMatureM).toBeGreaterThanOrEqual(3);
      expect(tree.crownRadiusMatureM).toBeLessThanOrEqual(9);
    });
  });

  it('gives every tree a mature trunk diameter from 10 to 150 cm', () => {
    byCategory('tree').forEach((tree) => {
      expect(tree.matureDbhCm).toBeGreaterThanOrEqual(10);
      expect(tree.matureDbhCm).toBeLessThanOrEqual(150);
    });
  });

  it('gives each geometry kind the footprint fields it needs', () => {
    catalogItems.forEach((item) => {
      if (item.geometryKind === 'point') expect(item.footprint.depthM).toBeGreaterThan(0);
      if (item.geometryKind === 'linear') expect(item.footprint.widthM).toBeGreaterThan(0);
      if (item.geometryKind === 'area') {
        expect(item.footprint.minAreaM2).toBeGreaterThan(0);
        expect(item.footprint.defaultAreaM2).toBeGreaterThanOrEqual(item.footprint.minAreaM2);
      }
    });
  });
});

describe('catalog names', () => {
  it('names items by what a resident calls them, not by catalog wording', () => {
    expect(catalogIndex.get('playground-structure')?.name).toBe('Play structure');
    expect(catalogIndex.get('outdoor-fitness-station')?.name).toBe('Fitness station');
    expect(catalogIndex.get('washroom-building')?.name).toBe('Washroom');
    expect(catalogIndex.get('wayfinding-sign')?.name).toBe('Signpost');
  });
});

describe('catalog entries', () => {
  it('models the three path surfaces as linear items', () => {
    const paths = byCategory('path');
    expect(paths.map((item) => item.geometryKind)).toEqual(['linear', 'linear', 'linear']);
  });

  it('marks parking and plaza as impervious and the pond as water', () => {
    expect(catalogIndex.get('parking-lot-small')?.surface).toBe('impervious');
    expect(catalogIndex.get('plaza')?.surface).toBe('impervious');
    expect(catalogIndex.get('pond')?.surface).toBe('water');
  });

  it('builds the community garden from 1.2 by 3 m raised beds with 0.6 m aisles', () => {
    const garden = catalogIndex.get('community-garden');
    expect(garden?.geometryKind).toBe('area');
    if (garden?.geometryKind !== 'area') return;
    expect(garden.footprint.module).toEqual({
      kind: 'raised-bed',
      widthM: 1.2,
      depthM: 3,
      aisleM: 0.6,
    });
    const side = Math.sqrt(garden.footprint.defaultAreaM2);
    expect(garden.plots).toBe(modulePlotCount(garden, square(side)));
  });

  it('fences the off-leash area', () => {
    const dogArea = catalogIndex.get('off-leash-area');
    if (dogArea?.geometryKind !== 'area') throw new Error('off-leash-area must be an area');
    expect(dogArea.footprint.perimeter?.gateCount).toBe(1);
  });

  // The source models keep their proportions under a uniform scale, so these footprints follow
  // the models' plan shapes: the path light's arm, the bench's backrest and the bushes' spread.
  it.each([
    ['path-light', 0.22, 1.76],
    ['washroom-building', 8, 6.33],
    ['waste-bin', 0.73, 0.73],
    ['bench', 1.8, 1],
    ['salal', 1.54, 1.38],
    ['red-flowering-currant', 1.44, 1.44],
    ['hedge', 2, 0.8],
    ['boulder-seat', 1.73, 1.34],
    ['log-seat', 1.08, 0.59],
    ['wayfinding-sign', 0.93, 0.19],
    ['recycling-bin', 0.49, 0.55],
    ['compost-bin', 2, 1],
    ['gazebo', 3.11, 3.78],
  ])('sizes the %s footprint to its model, %f by %f m', (id, widthM, depthM) => {
    const item = catalogIndex.get(id);
    if (item?.geometryKind !== 'point') throw new Error(`${id} must be a point item`);
    expect(item.footprint).toEqual({ widthM, depthM });
  });
});

describe('juice round items', () => {
  // The gazebo is an amenity: a shelter category would need a schema change.
  it.each([
    ['hedge', 'shrub'],
    ['boulder-seat', 'seating'],
    ['log-seat', 'seating'],
    ['planter', 'garden'],
    ['wayfinding-sign', 'amenity'],
    ['recycling-bin', 'amenity'],
    ['compost-bin', 'garden'],
    ['gazebo', 'amenity'],
  ])('files %s as a fixed point item under %s', (id, category) => {
    const item = catalogIndex.get(id);
    expect(item).toMatchObject({ category, geometryKind: 'point', scalePolicy: 'fixed' });
    expect(item?.modelKey).toBe(id);
    expect(item?.unitCost.perItemCad).toBeGreaterThan(0);
  });
});

describe('modulePlotCount', () => {
  it('fits beds with an aisle on every side, as the metrics engine does', () => {
    const garden = catalogIndex.get('community-garden');
    if (garden?.geometryKind !== 'area') throw new Error('community-garden must be an area');
    // The baseline garden is 12 m by 13 m: 6 columns of 1.8 m and 3 rows of 3.6 m, plus an aisle.
    expect(modulePlotCount(garden, rectangle(12, 13))).toBe(18);
    expect(modulePlotCount(garden, rectangle(12, 9))).toBe(12);
    expect(modulePlotCount(garden, square(2))).toBe(0);
  });

  it('returns 0 for an area item without a module', () => {
    const lawn = catalogIndex.get('lawn');
    if (lawn?.geometryKind !== 'area') throw new Error('lawn must be an area');
    expect(modulePlotCount(lawn, square(25))).toBe(0);
  });
});
