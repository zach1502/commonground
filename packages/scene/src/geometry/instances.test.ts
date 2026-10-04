import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '@parkshape/core';

import type { CatalogItem, PlacedItem } from '../types.js';

import {
  groupInstances,
  instanceMatrix,
  ScaleError,
  TREE_15_YEAR_FACTOR,
  UnknownCatalogItemError,
} from './instances.js';
import { heightmapFrom } from './synthetic-heightmap.js';

const ground = heightmapFrom({ width: 20, height: 20, resolutionM: 1 }, (x) => x * 0.1);
const catalog: CatalogItem[] = [
  { id: 'maple', modelKey: 'tree-maple', category: 'tree' },
  { id: 'bench', modelKey: 'bench-wood', category: 'bench' },
];

function placed(id: string, catalogId: string, scale: PlacedItem['scale'] = 1): PlacedItem {
  return { id, catalogId, position: { x: 5, z: 5 }, rotationY: 0.5, scale };
}

describe('groupInstances', () => {
  const items = [placed('a', 'maple'), placed('b', 'maple'), placed('c', 'bench', 1.5)];
  const groups = groupInstances({
    heightmap: ground,
    items,
    catalog,
    random: createSeededRandom(1),
  });

  it('groups items by model key', () => {
    expect([...groups.keys()]).toEqual(['tree-maple', 'bench-wood']);
    expect(groups.get('tree-maple')?.transforms).toHaveLength(2);
    expect(groups.get('bench-wood')?.category).toBe('bench');
  });

  it('sets each instance on the ground and keeps its heading', () => {
    const bench = groups.get('bench-wood')?.transforms[0];
    expect(bench?.position.x).toBe(5);
    expect(bench?.position.y).toBeCloseTo(0.5);
    expect(bench?.position.z).toBe(5);
    expect(bench?.rotationY).toBe(0.5);
  });

  it('keeps non-tree scale as requested', () => {
    expect(groups.get('bench-wood')?.transforms[0]?.scale).toBe(1.5);
  });

  it('draws trees at their 15-year size, half the mature model, varied within 10 percent', () => {
    expect(TREE_15_YEAR_FACTOR).toBe(0.5);
    const scales = groups.get('tree-maple')?.transforms.map((t) => t.scale) ?? [];
    scales.forEach((scale) => {
      expect(scale).toBeGreaterThanOrEqual(0.5 * 0.9);
      expect(scale).toBeLessThanOrEqual(0.5 * 1.1);
    });
    expect(scales[0]).not.toBe(scales[1]);
  });

  it('tints tree foliage within 6 percent lightness and leaves other items untinted', () => {
    const tints = groups.get('tree-maple')?.transforms.map((t) => t.tint) ?? [];
    tints.forEach((tint) => {
      expect(Math.abs(tint ?? 1)).toBeLessThanOrEqual(0.06);
    });
    expect(tints[0]).not.toBe(tints[1]);
    expect(groups.get('bench-wood')?.transforms[0]?.tint).toBe(0);
  });

  it('scales every instance matrix by the same factor on all three axes', () => {
    groups.forEach((group) => {
      group.transforms.forEach((transform) => {
        const m = instanceMatrix(transform);
        const axis = (k: number) => Math.hypot(m[k] ?? 0, m[k + 1] ?? 0, m[k + 2] ?? 0);
        expect(axis(0)).toBeCloseTo(transform.scale);
        expect(axis(4)).toBeCloseTo(transform.scale);
        expect(axis(8)).toBeCloseTo(transform.scale);
      });
    });
  });
});

describe('groupInstances scale and catalog checks', () => {
  it('accepts a vector scale with equal parts', () => {
    const uniform = groupInstances({
      heightmap: ground,
      items: [placed('d', 'bench', { x: 2, y: 2, z: 2 })],
      catalog,
      random: createSeededRandom(1),
    });
    expect(uniform.get('bench-wood')?.transforms[0]?.scale).toBe(2);
  });

  it('refuses a non-uniform scale', () => {
    const run = (): unknown =>
      groupInstances({
        heightmap: ground,
        items: [placed('e', 'bench', { x: 1, y: 2, z: 1 })],
        catalog,
        random: createSeededRandom(1),
      });
    expect(run).toThrow(ScaleError);
    try {
      run();
    } catch (error) {
      expect(error).toMatchObject({ kind: 'non-uniform-scale', itemId: 'e' });
    }
  });

  it('refuses an item that is not in the catalog', () => {
    const run = (): unknown =>
      groupInstances({
        heightmap: ground,
        items: [placed('f', 'oak')],
        catalog,
        random: createSeededRandom(1),
      });
    expect(run).toThrow(UnknownCatalogItemError);
  });
});

describe('instanceMatrix', () => {
  it('composes a uniform scale, a turn about y and a translation in column-major order', () => {
    const m = instanceMatrix({ position: { x: 1, y: 2, z: 3 }, rotationY: Math.PI / 2, scale: 2 });
    expect(m).toHaveLength(16);
    // Local +x turns to world -z.
    expect([m[0], m[1], m[2]].map((v) => v ?? 0)).toEqual([
      expect.closeTo(0),
      0,
      expect.closeTo(-2),
    ]);
    expect(m[5]).toBe(2);
    expect([m[12], m[13], m[14], m[15]]).toEqual([1, 2, 3, 1]);
  });
});
