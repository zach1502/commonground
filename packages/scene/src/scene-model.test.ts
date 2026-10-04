import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '@parkshape/core';

import { heightmapFrom } from './geometry/synthetic-heightmap.js';
import { buildSceneModel } from './scene-model.js';
import type { ParkDocument } from './types.js';

const heightmap = heightmapFrom({ width: 30, height: 20, resolutionM: 1 }, () => 1);
const document: ParkDocument = {
  items: [{ id: 'a', catalogId: 'maple', position: { x: 3, z: 3 }, rotationY: 0, scale: 1 }],
  paths: [
    {
      id: 'p',
      points: [
        { x: 1, z: 1 },
        { x: 9, z: 1 },
      ],
      widthM: 2,
    },
  ],
  areas: [
    {
      id: 'g',
      kind: 'garden',
      outline: [
        { x: 5, z: 5 },
        { x: 15, z: 5 },
        { x: 15, z: 15 },
        { x: 5, z: 15 },
      ],
    },
  ],
  water: [],
};

describe('buildSceneModel', () => {
  const model = buildSceneModel({
    heightmap,
    document,
    catalog: [{ id: 'maple', modelKey: 'tree-maple', category: 'tree' }],
    random: createSeededRandom(2),
  });

  it('groups the items and lays out each area by id', () => {
    expect(model.groups.get('tree-maple')?.transforms).toHaveLength(1);
    expect(model.areas.map((area) => area.id)).toEqual(['g']);
    expect(model.areas[0]?.fence?.panels.length).toBeGreaterThan(0);
  });

  it('bounds the parcel', () => {
    expect(model.bounds).toMatchObject({ maxX: 29, maxZ: 19, minY: 1, maxY: 1 });
  });
});
