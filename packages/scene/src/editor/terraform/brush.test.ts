import { describe, expect, it } from 'vitest';

import {
  emptyMask,
  gridOf,
  makeFlatHeightmap,
  makeRampHeightmap,
  measureTerraform,
  type Grid,
  type Heightmap,
} from '@parkshape/core';

import { flattenBrush, levelUnderItem, raiseLower, smoothBrush } from './brush.js';
import { mergeGradeDelta } from './grade-delta.js';
import type { CellSampler } from './types.js';

const SIZE = 20;
const flat: Heightmap = makeFlatHeightmap({ width: SIZE, height: SIZE });
const grid: Grid = gridOf(flat);
const flatSample: CellSampler = () => 0;

const rampSampler = (heightmap: Heightmap): CellSampler => {
  return (x, y) => heightmap.elevations[y * heightmap.width + x] ?? 0;
};

const cutFill = (cells: { x: number; y: number; deltaM: number }[]) =>
  measureTerraform({
    grid,
    parcel: emptyMask(grid),
    gradeDelta: mergeGradeDelta({ cells: [] }, { cells }),
    lockedTrees: [],
    noGradeZones: [],
    maxDeviationM: 5,
    rootZonePerDbhCm: 0.12,
  });

describe('raiseLower', () => {
  const stroke = { grid, radiusM: 3, strength: 1, dt: 0.1 };

  it('conserves volume: an equal raise and lower give net zero and matching cut and fill', () => {
    const raised = raiseLower({ ...stroke, centre: { x: 5, y: 10 } }, 'raise');
    const lowered = raiseLower({ ...stroke, centre: { x: 15, y: 10 } }, 'lower');
    const measure = cutFill([...raised.cells, ...lowered.cells]);
    expect(measure.net).toBeCloseTo(0, 6);
    expect(measure.cut).toBeCloseTo(measure.fill, 6);
    expect(measure.fill).toBeGreaterThan(0);
  });

  it('keeps the patch sparse: only cells inside the radius appear', () => {
    const patch = raiseLower({ ...stroke, centre: { x: 10, y: 10 } }, 'raise');
    expect(patch.cells.length).toBeGreaterThan(0);
    expect(patch.cells.length).toBeLessThan(SIZE * SIZE);
    patch.cells.forEach((cell) => {
      expect(Math.hypot(cell.x + 0.5 - 10, cell.y + 0.5 - 10)).toBeLessThan(stroke.radiusM);
      expect(cell.deltaM).toBeGreaterThan(0);
    });
  });

  it('falls off from the centre to the rim', () => {
    const patch = raiseLower({ ...stroke, centre: { x: 10, y: 10 } }, 'raise');
    const at = (x: number, y: number) =>
      patch.cells.find((cell) => cell.x === x && cell.y === y)?.deltaM ?? 0;
    expect(at(9, 9)).toBeGreaterThan(at(11, 10));
  });
});

describe('smoothBrush', () => {
  it('lowers an isolated spike toward its neighbours', () => {
    const spike: CellSampler = (x, y) => (x === 10 && y === 10 ? 4 : 0);
    const patch = smoothBrush({
      grid,
      centre: { x: 10, y: 10 },
      radiusM: 2,
      strength: 1,
      dt: 0.5,
      sample: spike,
    });
    const peak = patch.cells.find((cell) => cell.x === 10 && cell.y === 10);
    expect(peak?.deltaM).toBeLessThan(0);
  });
});

describe('flattenBrush', () => {
  it('moves cells toward the target elevation', () => {
    const patch = flattenBrush({
      grid,
      centre: { x: 10, y: 10 },
      radiusM: 3,
      strength: 1,
      dt: 0.5,
      sample: flatSample,
      targetM: 2,
    });
    patch.cells.forEach((cell) => {
      expect(cell.deltaM).toBeGreaterThan(0);
    });
  });
});

describe('levelUnderItem', () => {
  it('produces a flat pad under a rectangle within 1 mm', () => {
    const ramp = makeRampHeightmap({ width: SIZE, height: SIZE, gradeX: 0.1 });
    const sample = rampSampler(ramp);
    const footprint = { centre: { x: 10, y: 10 }, widthM: 4, depthM: 4, rotationDeg: 0 };
    const patch = levelUnderItem({ grid, footprint, sample });
    const levels = patch.cells.map((cell) => sample(cell.x, cell.y) + cell.deltaM);
    const spread = Math.max(...levels) - Math.min(...levels);
    expect(patch.cells.length).toBeGreaterThan(0);
    expect(spread).toBeLessThan(0.001);
  });
});
