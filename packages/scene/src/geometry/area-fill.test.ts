import { describe, expect, it } from 'vitest';

import { createSeededRandom } from '@parkshape/core';

import { buildAreaMesh, fillModules, nearestPanelIndex, samplePerimeter } from './area-fill.js';
import { meshGroundArea } from './measure.js';
import { isInsidePolygon } from './polygon.js';
import { heightmapFrom } from './synthetic-heightmap.js';

const flat = heightmapFrom({ width: 40, height: 40, resolutionM: 1 }, () => 1);
const square = [
  { x: 10, z: 10 },
  { x: 20, z: 10 },
  { x: 20, z: 20 },
  { x: 10, z: 20 },
];
// An L: the 10 x 10 square with its 5 x 5 upper-right quarter cut away.
const ell = [
  { x: 10, z: 10 },
  { x: 15, z: 10 },
  { x: 15, z: 15 },
  { x: 20, z: 15 },
  { x: 20, z: 20 },
  { x: 10, z: 20 },
];

describe('isInsidePolygon', () => {
  it('separates points inside and outside a concave outline', () => {
    expect(isInsidePolygon(ell, { x: 12, z: 12 })).toBe(true);
    expect(isInsidePolygon(ell, { x: 18, z: 12 })).toBe(false);
  });
});

describe('buildAreaMesh', () => {
  it('splits a square into two triangles that cover its area', () => {
    const mesh = buildAreaMesh(flat, square, { liftM: 0.02 });
    expect(mesh.indices).toHaveLength(2 * 3);
    expect(meshGroundArea(mesh)).toBeCloseTo(100);
    expect(mesh.positions[1]).toBeCloseTo(1.02);
  });

  it('triangulates a concave outline without covering the notch', () => {
    const mesh = buildAreaMesh(flat, ell, {});
    expect(mesh.indices).toHaveLength(4 * 3);
    expect(meshGroundArea(mesh)).toBeCloseTo(75);
  });

  it('accepts clockwise outlines', () => {
    expect(meshGroundArea(buildAreaMesh(flat, [...square].reverse(), {}))).toBeCloseTo(100);
  });
});

describe('samplePerimeter', () => {
  it('puts posts at the given spacing when it divides the perimeter', () => {
    const fence = samplePerimeter(flat, square, 2);
    expect(fence.posts).toHaveLength(20);
    expect(fence.panels).toHaveLength(20);
    expect(fence.panelLengthM).toBeCloseTo(2);
    expect(fence.posts[1]).toEqual({ x: 12, y: 1, z: 10 });
  });

  it('shortens the spacing so posts close the loop evenly', () => {
    const fence = samplePerimeter(flat, square, 3);
    expect(fence.posts).toHaveLength(14);
    expect(fence.panelLengthM).toBeCloseTo(40 / 14);
  });

  it('turns each panel to follow its edge', () => {
    const fence = samplePerimeter(flat, square, 2);
    expect(fence.panels[0]).toEqual({ position: { x: 11, y: 1, z: 10 }, rotationY: 0 });
    expect(fence.panels[5]?.rotationY).toBeCloseTo(-Math.PI / 2);
  });
});

describe('nearestPanelIndex', () => {
  it('picks the panel closest to where a path meets the fence', () => {
    const fence = samplePerimeter(flat, square, 2);
    expect(nearestPanelIndex(fence.panels, { x: 20.5, z: 13 })).toBe(6);
  });
});

describe('fillModules', () => {
  const zeroJitter = { next: () => 0.5 };

  it('fits a 3 by 3 grid of 2 m plots with 1 m aisles in a 10 m square', () => {
    const plots = fillModules(square, { widthM: 2, depthM: 2, aisleM: 1, jitterM: 0 }, zeroJitter);
    expect(plots).toHaveLength(9);
    expect(plots[0]).toEqual({ x: 12, z: 12 });
    expect(plots[8]).toEqual({ x: 18, z: 18 });
  });

  it('fits fewer rows when plots are deeper', () => {
    const plots = fillModules(square, { widthM: 2, depthM: 3, aisleM: 1, jitterM: 0 }, zeroJitter);
    expect(plots).toHaveLength(6);
  });

  it('skips plots that would cross a concave notch', () => {
    const plots = fillModules(ell, { widthM: 2, depthM: 2, aisleM: 1, jitterM: 0 }, zeroJitter);
    expect(plots).toHaveLength(5);
  });

  it('jitters plots from the injected random within half an aisle', () => {
    const plots = fillModules(
      square,
      { widthM: 2, depthM: 2, aisleM: 1, jitterM: 5 },
      createSeededRandom(7),
    );
    expect(plots).toHaveLength(9);
    const first = plots[0] ?? { x: 0, z: 0 };
    expect(Math.abs(first.x - 12)).toBeLessThanOrEqual(0.5);
    expect(Math.abs(first.z - 12)).toBeLessThanOrEqual(0.5);
    expect(first).not.toEqual({ x: 12, z: 12 });
  });
});
