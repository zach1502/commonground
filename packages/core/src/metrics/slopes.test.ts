import { describe, expect, it } from 'vitest';

import { designOf } from './fixtures/design-builders.js';
import { makeRampHeightmap } from './heightmap.js';
import { measurePathSlopes, samplePolyline } from './slopes.js';

const limits = { maxRunning: 0.05, maxCross: 0.02 };
const pathsOf = (points: { x: number; y: number }[][]) =>
  designOf({
    paths: points.map((line, index) => ({
      id: `p${String(index)}`,
      surface: 'asphalt',
      widthM: 2,
      points: line as [{ x: number; y: number }, { x: number; y: number }],
    })),
  }).paths;

describe('samplePolyline', () => {
  it('samples at most 1 m apart and keeps both ends', () => {
    const samples = samplePolyline(
      [
        { x: 0, y: 0 },
        { x: 2.5, y: 0 },
      ],
      1,
    );
    expect(samples).toHaveLength(4);
    expect(samples[0]).toEqual({ x: 0, y: 0 });
    expect(samples[3]).toEqual({ x: 2.5, y: 0 });
  });

  it('drops repeated points', () => {
    expect(
      samplePolyline(
        [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ],
        1,
      ),
    ).toHaveLength(2);
  });
});

describe('measurePathSlopes', () => {
  it('reads a 5% running slope on a 5% ramp', () => {
    const ramp = makeRampHeightmap({ width: 60, height: 20, gradeX: 0.05 });
    const [result] = measurePathSlopes(
      ramp,
      pathsOf([
        [
          { x: 5, y: 10 },
          { x: 45, y: 10 },
        ],
      ]),
      limits,
    );
    expect(Math.abs((result?.maxRunning ?? 0) - 0.05)).toBeLessThan(0.002);
    expect(result?.maxCross).toBeCloseTo(0, 6);
    expect(result?.runningSegments).toEqual([]);
  });

  it('reads cross slope on a side-hill path', () => {
    const sideHill = makeRampHeightmap({ width: 60, height: 20, gradeY: 0.03 });
    const [result] = measurePathSlopes(
      sideHill,
      pathsOf([
        [
          { x: 5, y: 10 },
          { x: 15, y: 10 },
        ],
      ]),
      limits,
    );
    expect(result?.maxRunning).toBeCloseTo(0, 6);
    expect(Math.abs((result?.maxCross ?? 0) - 0.03)).toBeLessThan(0.002);
    expect(result?.crossSegments).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe('measurePathSlopes offenders', () => {
  it('names the segments that break the running limit', () => {
    const steep = makeRampHeightmap({ width: 40, height: 40, gradeX: 0.07 });
    const bent = [
      { x: 5, y: 5 },
      { x: 8, y: 5 },
      { x: 8, y: 9 },
    ];
    const [result] = measurePathSlopes(steep, pathsOf([bent]), limits);
    // Segments 0 to 2 run east up the 7% slope; segments 3 to 6 run north across it.
    expect(result?.runningSegments).toEqual([0, 1, 2]);
    expect(result?.crossSegments).toEqual([3, 4, 5, 6]);
  });

  it('numbers paths from 1 in drawing order', () => {
    const flat = makeRampHeightmap({ width: 20, height: 20 });
    const lines = [
      [
        { x: 1, y: 1 },
        { x: 5, y: 1 },
      ],
      [
        { x: 1, y: 5 },
        { x: 5, y: 5 },
      ],
    ];
    expect(measurePathSlopes(flat, pathsOf(lines), limits).map((p) => p.pathNumber)).toEqual([
      1, 2,
    ]);
  });
});
