import { describe, expect, it } from 'vitest';

import {
  heightmapIssues,
  makeFlatHeightmap,
  makeRampHeightmap,
  sampleAt,
  slopeAt,
  withGradeDelta,
} from './heightmap.js';

describe('makeFlatHeightmap', () => {
  it('fills every cell with one elevation', () => {
    const flat = makeFlatHeightmap({ width: 3, height: 2, elevationM: 4 });
    expect(flat.elevations).toHaveLength(6);
    expect([...flat.elevations].every((value) => value === 4)).toBe(true);
    expect(flat.resolutionM).toBe(1);
    expect(flat.originLocal).toEqual({ x: 0, y: 0 });
  });

  it('defaults to sea level', () => {
    expect(sampleAt(makeFlatHeightmap({ width: 2, height: 2 }), { x: 1, y: 1 })).toBe(0);
  });
});

describe('sampleAt', () => {
  const ramp = makeRampHeightmap({ width: 10, height: 10, gradeX: 0.05, baseM: 2 });

  it('matches a plane exactly between cell centres', () => {
    expect(sampleAt(ramp, { x: 3.3, y: 7.1 })).toBeCloseTo(2 + 0.05 * 3.3, 5);
  });

  it('interpolates bilinearly inside one cell', () => {
    const bumpy = makeFlatHeightmap({ width: 2, height: 2 });
    const raised = withGradeDelta(bumpy, { cells: [{ x: 1, y: 1, deltaM: 4 }] });
    // Cell centres sit at 0.5 and 1.5, so (1, 1) is the middle of all four and gets a quarter.
    expect(sampleAt(raised, { x: 1, y: 1 })).toBeCloseTo(1, 6);
    expect(sampleAt(raised, { x: 1.5, y: 1.5 })).toBeCloseTo(4, 6);
  });

  it('holds the edge value outside the grid', () => {
    expect(sampleAt(ramp, { x: -5, y: 5 })).toBeCloseTo(2 + 0.05 * 0.5, 5);
    expect(sampleAt(ramp, { x: 50, y: 5 })).toBeCloseTo(2 + 0.05 * 9.5, 5);
  });

  it('respects the origin and resolution', () => {
    const shifted = makeRampHeightmap({
      width: 4,
      height: 4,
      gradeY: 0.1,
      resolutionM: 2,
      originLocal: { x: 100, y: 100 },
    });
    expect(sampleAt(shifted, { x: 103, y: 104 })).toBeCloseTo(0.1 * 104, 4);
  });
});

describe('withGradeDelta', () => {
  it('returns a new heightmap and leaves the original alone', () => {
    const flat = makeFlatHeightmap({ width: 3, height: 3 });
    const lowered = withGradeDelta(flat, {
      cells: [
        { x: 1, y: 1, deltaM: -0.5 },
        { x: 1, y: 1, deltaM: -0.25 },
      ],
    });
    expect(sampleAt(lowered, { x: 1.5, y: 1.5 })).toBeCloseTo(-0.75, 6);
    expect(sampleAt(flat, { x: 1.5, y: 1.5 })).toBe(0);
  });

  it('ignores cells outside the grid', () => {
    const flat = makeFlatHeightmap({ width: 2, height: 2 });
    const same = withGradeDelta(flat, { cells: [{ x: 5, y: 0, deltaM: 1 }] });
    expect([...same.elevations]).toEqual([0, 0, 0, 0]);
  });
});

describe('slopeAt', () => {
  it('measures the grade of a diagonal plane', () => {
    const ramp = makeRampHeightmap({ width: 20, height: 20, gradeX: 0.03, gradeY: 0.04 });
    expect(slopeAt(ramp, { x: 10, y: 10 })).toBeCloseTo(0.05, 5);
  });

  it('is zero on flat ground', () => {
    expect(slopeAt(makeFlatHeightmap({ width: 5, height: 5 }), { x: 2, y: 2 })).toBe(0);
  });
});

describe('heightmapIssues', () => {
  it('accepts a well-formed heightmap', () => {
    expect(heightmapIssues(makeFlatHeightmap({ width: 2, height: 3 }))).toEqual([]);
  });

  it('reports a wrong elevation count', () => {
    const flat = makeFlatHeightmap({ width: 2, height: 2 });
    const short = { ...flat, elevations: new Float32Array(3) };
    expect(heightmapIssues(short)).toEqual([{ kind: 'elevationCount', expected: 4, actual: 3 }]);
  });

  it('reports an empty grid or a bad resolution', () => {
    const flat = makeFlatHeightmap({ width: 2, height: 2 });
    const empty = { ...flat, width: 0, elevations: new Float32Array(0) };
    expect(heightmapIssues(empty)).toContainEqual({
      kind: 'gridSize',
      width: 0,
      height: 2,
      resolutionM: 1,
    });
    expect(heightmapIssues({ ...flat, resolutionM: 0 })[0]?.kind).toBe('gridSize');
  });
});

describe('heightmap bounds', () => {
  it('samples an east-west ramp with a shifted origin and 2 m cells', () => {
    const shifted = makeRampHeightmap({
      width: 4,
      height: 4,
      gradeX: 0.1,
      resolutionM: 2,
      originLocal: { x: 100, y: 0 },
    });
    // The first cell centre is 1 m east of the origin.
    expect(shifted.elevations[0]).toBeCloseTo(0.1 * 101, 4);
    expect(sampleAt(shifted, { x: 103, y: 4 })).toBeCloseTo(0.1 * 103, 4);
  });

  it('measures the slope of a ramp with 2 m cells', () => {
    const ramp = makeRampHeightmap({ width: 10, height: 10, gradeX: 0.05, resolutionM: 2 });
    expect(slopeAt(ramp, { x: 10, y: 10 })).toBeCloseTo(0.05, 6);
  });

  it('ignores a grade cell one column east of the grid instead of raising the next row', () => {
    const flat = makeFlatHeightmap({ width: 3, height: 3 });
    const graded = withGradeDelta(flat, { cells: [{ x: 3, y: 0, deltaM: 1 }] });
    expect([...graded.elevations]).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });

  it('reports a fractional width or a zero height', () => {
    const flat = makeFlatHeightmap({ width: 2, height: 2 });
    const fractional = { ...flat, width: 2.5, elevations: new Float32Array(5) };
    expect(heightmapIssues(fractional)).toEqual([
      { kind: 'gridSize', width: 2.5, height: 2, resolutionM: 1 },
    ]);
    const flatRow = { ...flat, width: 3, height: 0, elevations: new Float32Array(0) };
    expect(heightmapIssues(flatRow)).toEqual([
      { kind: 'gridSize', width: 3, height: 0, resolutionM: 1 },
    ]);
  });
});
