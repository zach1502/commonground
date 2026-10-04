import { describe, expect, it } from 'vitest';

import { ribbonUvs } from './ribbon-uv.js';
import { buildRibbon } from './ribbon.js';
import { heightmapFrom } from './synthetic-heightmap.js';

const flat = heightmapFrom({ width: 60, height: 20, resolutionM: 1 }, () => 5);

describe('ribbonUvs', () => {
  it('runs v along the path in metres, so the last v is the path length', () => {
    const points = [
      { x: 5, z: 10 },
      { x: 20, z: 10 },
      { x: 45, z: 10 },
    ];
    const arrays = buildRibbon(flat, points, { widthM: 2 });
    const uvs = ribbonUvs(arrays);
    expect(uvs.at(-1)).toBeCloseTo(40, 1);
    expect(uvs[1]).toBeCloseTo(0);
  });

  it('runs u across the path in metres', () => {
    const arrays = buildRibbon(
      flat,
      [
        { x: 5, z: 10 },
        { x: 25, z: 10 },
      ],
      { widthM: 2.5 },
    );
    const uvs = ribbonUvs(arrays);
    expect(Math.abs((uvs[2] ?? 0) - (uvs[0] ?? 0))).toBeCloseTo(2.5);
  });
});
