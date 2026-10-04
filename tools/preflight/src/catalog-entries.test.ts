import { describe, expect, it } from 'vitest';

import { catalogEntries } from './catalog-entries.js';

const SOURCE = `export const items = [
  {
    id: 'garden',
    footprint: { defaultAreaM2: 160, module: { widthM: 1.2, depthM: 3 } },
    modelKey: 'community-garden',
    scalePolicy: 'tile',
  },
  { id: 'bed', widthM: 1.2, depthM: 3, heightM: 0.45, modelKey: "kit-bed", scalePolicy: 'fixed' },
  { id: 'bench', footprint: { widthM: 1.8, depthM: 0.6 }, heightM: 0.9, modelKey: 'bench' },
];`;

describe('catalogEntries', () => {
  it('reads each object that names a modelKey, with its footprint and scale policy', () => {
    expect(catalogEntries(SOURCE)).toEqual([
      {
        id: 'garden',
        modelKey: 'community-garden',
        scalePolicy: 'tile',
        dims: {},
        plan: 'footprint',
        line: 5,
      },
      {
        id: 'bed',
        modelKey: 'kit-bed',
        scalePolicy: 'fixed',
        dims: { widthM: 1.2, depthM: 3, heightM: 0.45 },
        plan: 'footprint',
        line: 8,
      },
      {
        id: 'bench',
        modelKey: 'bench',
        dims: { widthM: 1.8, depthM: 0.6, heightM: 0.9 },
        plan: 'footprint',
        line: 9,
      },
    ]);
  });

  it('marks a tree, which names a crown, as a trunk footprint', () => {
    const tree =
      "{ id: 'fir', footprint: { widthM: 0.6 }, crownRadiusMatureM: 6, modelKey: 'tree-fir' }";
    expect(catalogEntries(tree)[0]?.plan).toBe('trunk');
  });

  it('ignores text without a modelKey', () => {
    expect(catalogEntries("const x = { id: 'a', model: 'b' };")).toEqual([]);
  });
});
