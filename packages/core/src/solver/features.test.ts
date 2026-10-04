import { describe, expect, it } from 'vitest';

import { catalogIndex, modulePlotCount } from '../catalog/catalog.js';
import { rectangle } from '../metrics/fixtures/design-builders.js';

import { footprintCells, planFeatures } from './features.js';
import { intentSchema } from './intent.js';

const BASE = { paths: { style: 'loop' }, canopy: 'keep-existing', character: 'natural' } as const;

function plan(features: unknown[]) {
  return planFeatures(intentSchema.parse({ ...BASE, features }), catalogIndex);
}

function entryOf(id: string) {
  const entry = catalogIndex.get(id);
  if (entry === undefined || entry.geometryKind === 'linear') throw new Error(id);
  return entry;
}

describe('planFeatures', () => {
  it('makes one feature per counted item and resolves categories to catalog entries', () => {
    const { features } = plan([
      { catalogId: 'bench', count: 2 },
      { category: 'dog', count: 1, size: 'large' },
    ]);
    expect(features.map((feature) => feature.entry.id)).toEqual([
      'bench',
      'bench',
      'off-leash-area',
    ]);
    expect(features[2]?.sizing).toEqual({ kind: 'preset', size: 'large' });
  });

  it('sends trees to the tree scatter and drops path features', () => {
    const { features, trees } = plan([
      { category: 'tree', count: 8 },
      { catalogId: 'garry-oak', count: 2 },
      { category: 'path', count: 1 },
    ]);
    expect(features).toEqual([]);
    expect(trees).toEqual([{ count: 8 }, { catalogId: 'garry-oak', count: 2 }]);
  });
});

describe('footprintCells', () => {
  it('sizes a box in metres, rounded up to whole cells', () => {
    const garden = entryOf('community-garden');
    expect(footprintCells(garden, { kind: 'box', widthM: 20.2, depthM: 18 }, 1)).toEqual({
      columns: 21,
      rows: 18,
    });
  });

  it('rounds point footprints up to whole cells', () => {
    expect(footprintCells(entryOf('bench'), { kind: 'preset', size: 'medium' }, 1)).toEqual({
      columns: 2,
      rows: 1,
    });
  });

  it('sizes areas at 0.6, 1 and 1.6 times the catalog default', () => {
    const pond = entryOf('pond');
    expect(footprintCells(pond, { kind: 'preset', size: 'small' }, 1)).toEqual({
      columns: 14,
      rows: 14,
    });
    expect(footprintCells(pond, { kind: 'preset', size: 'medium' }, 1)).toEqual({
      columns: 18,
      rows: 18,
    });
    expect(footprintCells(pond, { kind: 'preset', size: 'large' }, 1)).toEqual({
      columns: 22,
      rows: 22,
    });
  });

  it('never goes below the catalog minimum area', () => {
    const dog = entryOf('off-leash-area');
    const size = footprintCells(dog, { kind: 'preset', size: 'small' }, 1);
    expect(size.columns * size.rows).toBeGreaterThanOrEqual(400);
  });

  it('grows a garden until it fits the plots asked for', () => {
    const garden = entryOf('community-garden');
    if (garden.geometryKind !== 'area') throw new Error('garden');
    const { columns, rows } = footprintCells(garden, { kind: 'plots', minPlots: 20 }, 1);
    expect(modulePlotCount(garden, rectangle(0, 0, columns, rows))).toBeGreaterThanOrEqual(20);
    expect(columns * rows).toBeLessThan(260);
  });
});
