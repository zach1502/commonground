import { describe, expect, it } from 'vitest';

import { catalogItems, categorySchema } from '@parkshape/core';

import { gridMove, PALETTE_GROUPS, paletteCost, paletteGroups } from './palette.js';

describe('PALETTE_GROUPS', () => {
  it('puts every catalog category in exactly one picker tab', () => {
    const listed = PALETTE_GROUPS.flatMap((group) => group.categories);
    expect([...listed].sort()).toEqual([...categorySchema.options].sort());
  });

  it('keeps each tab under 24 items, so the picker needs no search field', () => {
    for (const group of paletteGroups(catalogItems)) {
      expect(group.entries.length).toBeLessThanOrEqual(24);
    }
  });

  it('holds trees and shrubs under plants, in catalog order', () => {
    const plants = paletteGroups(catalogItems).find((group) => group.group === 'plants');
    expect(plants?.entries.map((entry) => entry.category)).toEqual([
      ...Array<string>(7).fill('tree'),
      ...Array<string>(3).fill('shrub'),
    ]);
  });
});

describe('paletteCost', () => {
  const byId = (id: string) => catalogItems.find((entry) => entry.id === id);

  it('reads a per-item, per-square-metre or per-plot unit cost', () => {
    expect(paletteCost(byId('bench'))).toEqual({ amountCad: 3500, unit: 'item' });
    expect(paletteCost(byId('lawn'))).toEqual({ amountCad: 15, unit: 'm2' });
    expect(paletteCost(byId('community-garden'))).toEqual({ amountCad: 900, unit: 'module' });
  });
});

describe('gridMove', () => {
  const count = 10;
  const columns = 4;

  it('moves one step left and right and one row up and down', () => {
    expect(gridMove(5, 'ArrowRight', count, columns)).toBe(6);
    expect(gridMove(5, 'ArrowLeft', count, columns)).toBe(4);
    expect(gridMove(5, 'ArrowDown', count, columns)).toBe(9);
    expect(gridMove(5, 'ArrowUp', count, columns)).toBe(1);
  });

  it('stops at the ends instead of wrapping', () => {
    expect(gridMove(0, 'ArrowLeft', count, columns)).toBe(0);
    expect(gridMove(9, 'ArrowRight', count, columns)).toBe(9);
    expect(gridMove(1, 'ArrowUp', count, columns)).toBe(1);
    expect(gridMove(7, 'ArrowDown', count, columns)).toBe(7);
  });

  it('jumps to the first and last tile with Home and End', () => {
    expect(gridMove(5, 'Home', count, columns)).toBe(0);
    expect(gridMove(5, 'End', count, columns)).toBe(9);
  });

  it('ignores other keys', () => {
    expect(gridMove(5, 'a', count, columns)).toBeNull();
  });
});
