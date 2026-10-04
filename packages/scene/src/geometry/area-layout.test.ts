import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '@parkshape/core';

import type { AreaFeature } from '../types.js';

import { layoutArea } from './area-layout.js';
import { heightmapFrom } from './synthetic-heightmap.js';

const flat = heightmapFrom({ width: 40, height: 40, resolutionM: 1 }, () => 2);
const outline = [
  { x: 10, z: 10 },
  { x: 20, z: 10 },
  { x: 20, z: 20 },
  { x: 10, z: 20 },
];
const garden: AreaFeature = { id: 'g', kind: 'garden', outline };
const path = [
  { x: 15, z: 5 },
  { x: 15, z: 9 },
];

describe('layoutArea', () => {
  const layout = layoutArea({
    heightmap: flat,
    area: garden,
    paths: [path],
    random: createSeededRandom(3),
  });

  it('fences the garden and leaves one panel open as a gate by the path', () => {
    const fence = layout.fence;
    expect(fence?.posts).toHaveLength(16);
    expect(fence?.panels).toHaveLength(15);
    expect(fence?.panels.filter((panel) => panel.position.z === 10)).toHaveLength(3);
  });

  it('stands fence posts on the ground at full size', () => {
    expect(layout.fence?.posts[0]).toEqual({
      position: { x: 10, y: 2, z: 10 },
      rotationY: 0,
      scale: 1,
    });
  });

  it('fills the garden with raised beds on the ground', () => {
    expect(layout.beds.length).toBeGreaterThan(0);
    layout.beds.forEach((bed) => {
      expect(bed.position.y).toBe(2);
      expect(bed.scale).toBe(1);
    });
  });

  it('draws a lawn with no fence and no beds', () => {
    const lawn = layoutArea({
      heightmap: flat,
      area: { id: 'l', kind: 'lawn', outline },
      paths: [],
      random: createSeededRandom(3),
    });
    expect(lawn.fence).toBeUndefined();
    expect(lawn.beds).toEqual([]);
    expect(lawn.surfaceColour).toBe('terrainMeadow');
    expect(lawn.surface.indices).toHaveLength(6);
  });
});
