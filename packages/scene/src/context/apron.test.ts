import { describe, expect, it } from 'vitest';

import { withGroundOutline } from '@parkshape/core';

import { triangleCorners } from '../geometry/measure.js';
import { isInsidePolygon } from '../geometry/polygon.js';
import { heightmapBounds, elevationAt } from '../geometry/sample.js';
import { heightmapFrom } from '../geometry/synthetic-heightmap.js';
import { PALETTE_FALLBACKS } from '../palette/colours.js';
import type { MeshArrays } from '../types.js';

import {
  APRON_BLEND_M,
  APRON_EXTENT_M,
  APRON_UNDER_ISLAND_M,
  apronElevation,
  buildApron,
  edgeMeanHeight,
} from './apron.js';

// A 176 by 86 m grid like the fixture, rising 0.06 m per metre to the north, so the south
// edge is 5 m lower than the north edge, as on Jonathan Rogers Park.
const SLOPE = 0.06;
const heightmap = heightmapFrom(
  { width: 176, height: 86, resolutionM: 1 },
  (_x, z) => 15 + SLOPE * z,
);
const bounds = heightmapBounds(heightmap);
const ground = apronElevation(heightmap);

describe('apronElevation', () => {
  it('meets the edge cell at the parcel edge, so there is no step', () => {
    const south = { x: 40, z: bounds.minZ };
    const north = { x: 120, z: bounds.maxZ };
    expect(ground(south)).toBeCloseTo(elevationAt(heightmap, south), 6);
    expect(ground(north)).toBeCloseTo(elevationAt(heightmap, north), 6);
    expect(ground({ x: 40, z: bounds.minZ - 0.01 })).toBeCloseTo(elevationAt(heightmap, south), 2);
  });

  it('is the edge mean everywhere past the blend band', () => {
    const mean = edgeMeanHeight(heightmap);
    expect(ground({ x: 40, z: bounds.minZ - APRON_BLEND_M })).toBeCloseTo(mean, 6);
    expect(ground({ x: bounds.maxX + 200, z: 20 })).toBeCloseTo(mean, 6);
  });

  it('eases from the edge to the mean inside the band', () => {
    const edge = elevationAt(heightmap, { x: 40, z: bounds.minZ });
    const halfway = ground({ x: 40, z: bounds.minZ - APRON_BLEND_M / 2 });
    const mean = edgeMeanHeight(heightmap);
    expect(halfway).toBeGreaterThan(edge);
    expect(halfway).toBeLessThan(mean);
  });

  it('follows the terrain inside the parcel', () => {
    const inside = { x: 80, z: 40 };
    expect(ground(inside)).toBeCloseTo(elevationAt(heightmap, inside), 6);
  });
});

describe('buildApron', () => {
  const apron = buildApron(heightmap, PALETTE_FALLBACKS);
  const vertices = apron.positions.length / 3;

  it('reaches 300 m past the parcel box on every side', () => {
    const xs = apron.positions.filter((_, index) => index % 3 === 0);
    const zs = apron.positions.filter((_, index) => index % 3 === 2);
    expect(APRON_EXTENT_M).toBe(300);
    expect(Math.min(...xs)).toBeCloseTo(bounds.minX - APRON_EXTENT_M);
    expect(Math.max(...xs)).toBeCloseTo(bounds.maxX + APRON_EXTENT_M);
    expect(Math.min(...zs)).toBeCloseTo(bounds.minZ - APRON_EXTENT_M);
    expect(Math.max(...zs)).toBeCloseTo(bounds.maxZ + APRON_EXTENT_M);
  });

  it('puts every vertex on the apron ground and none inside the parcel', () => {
    for (let vertex = 0; vertex < vertices; vertex += 1) {
      const x = apron.positions[vertex * 3] ?? 0;
      const y = apron.positions[vertex * 3 + 1] ?? 0;
      const z = apron.positions[vertex * 3 + 2] ?? 0;
      expect(y).toBeCloseTo(ground({ x, z }), 4);
      const inside = x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ;
      expect(inside).toBe(false);
    }
  });

  it('stays under 14k vertices for a parcel the size of the fixture', () => {
    expect(vertices).toBeLessThan(14_000);
    expect(apron.indices.length % 3).toBe(0);
    expect(Math.max(...apron.indices)).toBeLessThan(vertices);
  });

  it('fades to the sky colour at its outer edge, so the fog leaves no line', () => {
    const colourAt = (x: number, z: number) => {
      for (let vertex = 0; vertex < vertices; vertex += 1) {
        const [px = 0, , pz = 0] = apron.positions.slice(vertex * 3, vertex * 3 + 3);
        if (Math.abs(px - x) < 0.01 && Math.abs(pz - z) < 0.01) {
          return [...apron.colours.slice(vertex * 3, vertex * 3 + 3)];
        }
      }
      return [];
    };
    const edge = colourAt(bounds.minX, bounds.minZ - 2);
    const outer = colourAt(bounds.minX, bounds.minZ - APRON_EXTENT_M);
    expect(edge).toHaveLength(3);
    expect(outer).toHaveLength(3);
    expect(outer[2] ?? 0).toBeGreaterThan(edge[2] ?? 0);
    expect(outer).not.toEqual(edge);
  });

  it('faces every normal up', () => {
    for (let vertex = 0; vertex < vertices; vertex += 1) {
      expect(apron.normals[vertex * 3 + 1] ?? 0).toBeGreaterThan(0.9);
    }
  });
});

describe('buildApron around a triangular parcel', () => {
  const outline = [
    { x: 0, y: 0 },
    { x: 176, y: 0 },
    { x: 0, y: 86 },
  ];
  const triangle = withGroundOutline(heightmap, outline);
  const apron = buildApron(triangle, PALETTE_FALLBACKS);
  const covers = (arrays: MeshArrays, point: { x: number; z: number }) => {
    for (let face = 0; face < arrays.indices.length / 3; face += 1) {
      if (isInsidePolygon(triangleCorners(arrays, face), point)) return true;
    }
    return false;
  };

  it('fills the grid box outside the triangle', () => {
    expect(covers(apron, { x: 150, z: 70 })).toBe(true);
    expect(covers(buildApron(heightmap, PALETTE_FALLBACKS), { x: 150, z: 70 })).toBe(false);
  });

  it('leaves the inside of the triangle to the island', () => {
    expect(covers(apron, { x: 30, z: 20 })).toBe(false);
  });

  it('sits a little under the island edge, so the island sides show', () => {
    const edge = { x: 88, z: 43 };
    const under = apronElevation(triangle)(edge);
    expect(under).toBeLessThan(elevationAt(heightmap, edge));
    expect(under).toBeCloseTo(elevationAt(heightmap, edge) - APRON_UNDER_ISLAND_M, 6);
  });
});
