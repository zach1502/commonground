import { describe, expect, it } from 'vitest';

import { meshGroundArea, polygonArea, triangleCorners } from './measure.js';
import { buildRibbon } from './ribbon.js';
import { heightmapFrom } from './synthetic-heightmap.js';

const flat = heightmapFrom({ width: 30, height: 30, resolutionM: 1 }, () => 2);
const slope = heightmapFrom({ width: 30, height: 30, resolutionM: 1 }, (x) => x * 0.5);

describe('buildRibbon', () => {
  it('covers width times length on a straight path over flat ground', () => {
    const mesh = buildRibbon(
      flat,
      [
        { x: 5, z: 5 },
        { x: 15, z: 5 },
      ],
      { widthM: 2 },
    );
    expect(meshGroundArea(mesh)).toBeCloseTo(20);
  });

  it('keeps the full width through a right-angle corner', () => {
    const points = [
      { x: 5, z: 5 },
      { x: 15, z: 5 },
      { x: 15, z: 15 },
    ];
    expect(meshGroundArea(buildRibbon(flat, points, { widthM: 2 }))).toBeCloseTo(40);
  });

  it('has two vertices per path point and two triangles per segment', () => {
    const points = [
      { x: 5, z: 5 },
      { x: 10, z: 5 },
      { x: 10, z: 10 },
      { x: 5, z: 10 },
    ];
    const mesh = buildRibbon(flat, points, { widthM: 2 });
    expect(mesh.positions).toHaveLength(points.length * 2 * 3);
    expect(mesh.indices).toHaveLength((points.length - 1) * 2 * 3);
  });

  it('drapes vertices on the terrain with a small lift', () => {
    const mesh = buildRibbon(
      slope,
      [
        { x: 4, z: 5 },
        { x: 12, z: 5 },
      ],
      {
        widthM: 2,
        liftM: 0.05,
      },
    );
    expect(mesh.positions[1]).toBeCloseTo(4 * 0.5 + 0.05);
    expect(mesh.positions[7]).toBeCloseTo(12 * 0.5 + 0.05);
  });
});

describe('buildRibbon surface', () => {
  it('faces every triangle up', () => {
    const mesh = buildRibbon(
      flat,
      [
        { x: 5, z: 5 },
        { x: 5, z: 15 },
      ],
      { widthM: 2 },
    );
    for (let index = 0; index < mesh.normals.length / 3; index += 1) {
      expect(mesh.normals[index * 3 + 1]).toBe(1);
    }
    for (let face = 0; face < mesh.indices.length / 3; face += 1) {
      expect(polygonArea(triangleCorners(mesh, face))).toBeGreaterThan(0);
    }
  });

  it('returns an empty mesh for fewer than two points', () => {
    expect(buildRibbon(flat, [{ x: 1, z: 1 }], { widthM: 2 }).indices).toHaveLength(0);
  });
});

describe('buildRibbon degenerate paths', () => {
  const widthM = 2;
  const halfWidth = widthM / 2;

  function everyVertexNear(
    mesh: ReturnType<typeof buildRibbon>,
    points: readonly { x: number; z: number }[],
    reach: number,
  ) {
    const xs = points.map((point) => point.x);
    const zs = points.map((point) => point.z);
    for (let index = 0; index < mesh.positions.length; index += 3) {
      const x = mesh.positions[index] ?? Number.NaN;
      const z = mesh.positions[index + 2] ?? Number.NaN;
      expect(Number.isFinite(x) && Number.isFinite(z)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(Math.min(...xs) - reach);
      expect(x).toBeLessThanOrEqual(Math.max(...xs) + reach);
      expect(z).toBeGreaterThanOrEqual(Math.min(...zs) - reach);
      expect(z).toBeLessThanOrEqual(Math.max(...zs) + reach);
    }
  }

  // Taken from the Cedar shade walk seed: the loop runs out to an entrance and straight back.
  it('stays near the path where it doubles back on itself', () => {
    const points = [
      { x: 171.4877025462963, z: 77.48871527777777 },
      { x: 171.5, z: 77.5 },
      { x: 171.4877025462963, z: 77.48871527777779 },
    ];
    everyVertexNear(buildRibbon(flat, points, { widthM }), points, 2 * halfWidth);
  });

  it('draws a repeated point the same as the path without it', () => {
    const corner = [
      { x: 5, z: 5 },
      { x: 15, z: 5 },
      { x: 15, z: 15 },
    ];
    const repeated = [corner[0], corner[1], corner[1], corner[2]].flatMap((p) => (p ? [p] : []));
    expect(buildRibbon(flat, repeated, { widthM })).toEqual(buildRibbon(flat, corner, { widthM }));
  });

  it('joins a closed loop at its first point with a mitred corner', () => {
    const loop = [
      { x: 5, z: 5 },
      { x: 15, z: 5 },
      { x: 15, z: 15 },
      { x: 5, z: 15 },
      { x: 5, z: 5 },
    ];
    const { positions } = buildRibbon(flat, loop, { widthM });
    const last = positions.length - 6;
    expect(Array.from(positions.slice(last))).toEqual(Array.from(positions.slice(0, 6)));
    const offset = Math.hypot((positions[0] ?? 0) - 5, (positions[2] ?? 0) - 5);
    expect(offset).toBeCloseTo(Math.SQRT2 * halfWidth);
    everyVertexNear(buildRibbon(flat, loop, { widthM }), loop, halfWidth);
  });
});
