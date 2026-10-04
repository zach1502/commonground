import { describe, expect, it } from 'vitest';

import { catalogItems, moduleKitItems } from '@parkshape/core';

import { assetTargets, budgetClassFor, BUDGETS } from './targets.js';

describe('assetTargets', () => {
  it('lists every catalog and module kit model key once', () => {
    const keys = assetTargets().map((target) => target.modelKey);
    const expected = [...catalogItems, ...moduleKitItems].map((item) => item.modelKey);
    expect(new Set(keys)).toEqual(new Set(expected));
    expect(keys).toHaveLength(new Set(keys).size);
  });

  it('uses the footprint and height for point items', () => {
    const bench = assetTargets().find((target) => target.modelKey === 'bench');
    expect(bench?.dims).toEqual({ widthM: 1.8, depthM: 1, heightM: 0.9 });
    expect(bench?.scalePolicy).toBe('fixed');
  });

  it('makes a square segment for linear items', () => {
    const path = assetTargets().find((target) => target.modelKey === 'path-asphalt');
    expect(path?.dims).toEqual({ widthM: 3, depthM: 3, heightM: 0.05 });
  });

  it('makes a square tile of the default area for area items', () => {
    const lawn = assetTargets().find((target) => target.modelKey === 'lawn');
    expect(lawn?.dims.widthM).toBeCloseTo(Math.sqrt(500));
    expect(lawn?.dims.depthM).toBeCloseTo(Math.sqrt(500));
  });

  it('reads module kit parts as they are', () => {
    const shed = assetTargets().find((target) => target.modelKey === 'kit-shed');
    expect(shed).toMatchObject({ budgetClass: 'buildings', scalePolicy: 'fixed' });
  });
});

describe('budgetClassFor', () => {
  it('maps catalog categories to the budget table', () => {
    expect(budgetClassFor('tree')).toBe('trees');
    expect(budgetClassFor('shrub')).toBe('trees');
    expect(budgetClassFor('washroom')).toBe('buildings');
    expect(budgetClassFor('seating')).toBe('furniture');
    expect(budgetClassFor('sports')).toBe('sports');
    expect(budgetClassFor('lawn-tile')).toBe('modules');
  });

  it('has the agreed triangle budgets', () => {
    const triangles = Object.fromEntries(
      Object.entries(BUDGETS).map(([name, budget]) => [name, budget.triangles]),
    );
    expect(triangles).toEqual({
      trees: 1500,
      buildings: 3000,
      furniture: 600,
      modules: 300,
      sports: 2000,
    });
  });
});
