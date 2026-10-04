import { describe, expect, it } from 'vitest';

import { withGroundOutline } from '@parkshape/core';

import { PALETTE_FALLBACKS } from '../palette/colours.js';

import { buildGroundMesh } from './ground-mesh.js';
import { heightmapFrom } from './synthetic-heightmap.js';
import { linearRgb, slopeBlend, srgbByte, terrainColours } from './terrain-colours.js';

const grid = { width: 11, height: 11, resolutionM: 1 };
const rgbAt = (colours: Float32Array, index: number) => [
  ...colours.slice(index * 3, index * 3 + 3),
];

describe('slopeBlend', () => {
  it('is grass under 8 percent, meadow by 20 percent and soil above', () => {
    expect(slopeBlend(0.05)).toEqual({ grass: 1, meadow: 0, soil: 0 });
    expect(slopeBlend(0.14).meadow).toBeCloseTo(0.5);
    expect(slopeBlend(0.25)).toEqual({ grass: 0, meadow: 0, soil: 1 });
  });

  it('always sums to 1', () => {
    [0, 0.08, 0.1, 0.19, 0.2, 0.21, 1].forEach((slope) => {
      const weights = slopeBlend(slope);
      expect(weights.grass + weights.meadow + weights.soil).toBeCloseTo(1);
    });
  });
});

describe('terrainColours', () => {
  it('gives a vertex on a 25 percent slope the soil colour', () => {
    const steep = heightmapFrom(grid, (x) => x * 0.25);
    const colours = terrainColours(steep, PALETTE_FALLBACKS, { beds: [] });
    const centre = 5 * grid.width + 5;
    rgbAt(colours, centre).forEach((channel, k) => {
      expect(channel).toBeCloseTo(linearRgb(PALETTE_FALLBACKS.soil)[k] ?? 0, 5);
    });
  });

  it('gives flat ground the grass colour and garden beds soilDark', () => {
    const flat = heightmapFrom(grid, () => 10);
    const bed = [
      { x: 1, z: 1 },
      { x: 4, z: 1 },
      { x: 4, z: 4 },
      { x: 1, z: 4 },
    ];
    const colours = terrainColours(flat, PALETTE_FALLBACKS, { beds: [bed] });
    expect(rgbAt(colours, 8 * grid.width + 8)).toEqual(
      linearRgb(PALETTE_FALLBACKS.terrainGrass).map((value) => Math.fround(value)),
    );
    expect(rgbAt(colours, 2 * grid.width + 2)).toEqual(
      linearRgb(PALETTE_FALLBACKS.soilDark).map((value) => Math.fround(value)),
    );
  });

  it('converts sRGB hex to linear light', () => {
    expect(linearRgb('#ffffff')).toEqual([1, 1, 1]);
    expect(linearRgb('#000000')).toEqual([0, 0, 0]);
    expect(linearRgb('#808080')[0]).toBeCloseTo(0.2158, 3);
  });
});

describe('srgbByte', () => {
  it('undoes linearRgb for every byte value', () => {
    for (let byte = 0; byte < 256; byte += 1) {
      const hex = `#${byte.toString(16).padStart(2, '0').repeat(3)}`;
      expect(srgbByte(linearRgb(hex)[0])).toBe(byte);
    }
  });

  it('clamps values outside 0 to 1', () => {
    expect(srgbByte(-0.2)).toBe(0);
    expect(srgbByte(1.4)).toBe(255);
  });
});

describe('terrainColours on an outline mesh', () => {
  const flat = withGroundOutline(
    heightmapFrom(grid, () => 1),
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 0, y: 7.5 },
    ],
  );
  const mesh = buildGroundMesh(flat, { skirtDepthM: 1 });
  const colours = terrainColours(flat, PALETTE_FALLBACKS, { beds: [], mesh });

  it('gives every vertex of the mesh a colour', () => {
    expect(colours.length).toBe(mesh.positions.length);
  });

  it('colours the cut vertices as ground and the skirt as soil', () => {
    const grass = linearRgb(PALETTE_FALLBACKS.terrainGrass).map((value) => Math.fround(value));
    const bed = linearRgb(PALETTE_FALLBACKS.soilDark).map((value) => Math.fround(value));
    expect(mesh.surfaceVertexCount).toBeGreaterThan(grid.width * grid.height);
    expect(rgbAt(colours, mesh.surfaceVertexCount - 1)).toEqual(grass);
    expect(rgbAt(colours, mesh.surfaceVertexCount)).toEqual(bed);
  });
});
