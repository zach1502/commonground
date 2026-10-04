import { describe, expect, it } from 'vitest';

import type { ItemCategory } from '../types.js';

import { placeholderParts } from './shapes.js';

const categories: ItemCategory[] = ['tree', 'building', 'bench', 'play', 'other'];

describe('placeholderParts', () => {
  it('gives every category at least one part standing on the ground', () => {
    categories.forEach((category) => {
      const parts = placeholderParts(category);
      expect(parts.length).toBeGreaterThan(0);
      parts.forEach((part) => {
        expect(part.baseY).toBeGreaterThanOrEqual(0);
      });
    });
  });

  it('draws a tree as a trunk under a canopy', () => {
    expect(placeholderParts('tree').map((part) => part.shape.kind)).toEqual(['cylinder', 'sphere']);
    const [trunk, canopy] = placeholderParts('tree');
    expect(canopy?.baseY).toBeGreaterThan(trunk?.baseY ?? 0);
  });

  it('draws a building as a box and a bench as a thin box', () => {
    expect(placeholderParts('building')[0]?.shape.kind).toBe('box');
    const bench = placeholderParts('bench')[0]?.shape;
    expect(bench?.kind).toBe('box');
    if (bench?.kind === 'box') {
      expect(bench.heightM).toBeLessThan(bench.widthM);
    }
  });
});
