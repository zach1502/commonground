import { describe, expect, it } from 'vitest';

import {
  appendPoint,
  catmullRom,
  finishPath,
  gradeStatus,
  insertMidpoint,
  removeLastPoint,
  segmentGrades,
  segmentMidpoints,
} from './path-tool.js';

const zigzag = [
  { x: 0, y: 0 },
  { x: 10, y: 0 },
  { x: 10, y: 10 },
];

describe('catmullRom', () => {
  it('passes through every control point', () => {
    const curve = catmullRom(zigzag, 4);
    expect(curve[0]).toEqual({ x: 0, y: 0 });
    expect(curve[4]).toEqual({ x: 10, y: 0 });
    expect(curve.at(-1)).toEqual({ x: 10, y: 10 });
    expect(curve).toHaveLength(9);
  });

  it('bends smoothly past the corner instead of cutting it', () => {
    const curve = catmullRom(zigzag, 4);
    const beforeCorner = curve[3];
    expect(beforeCorner?.y).toBeLessThan(0);
  });

  it('returns short lines unchanged', () => {
    expect(catmullRom([{ x: 0, y: 0 }], 4)).toEqual([{ x: 0, y: 0 }]);
    const line = zigzag.slice(0, 2);
    expect(catmullRom(line, 2)).toEqual([
      { x: 0, y: 0 },
      { x: 5, y: 0 },
      { x: 10, y: 0 },
    ]);
  });
});

describe('midpoints', () => {
  it('lists the middle of each segment', () => {
    expect(segmentMidpoints(zigzag)).toEqual([
      { x: 5, y: 0 },
      { x: 10, y: 5 },
    ]);
  });

  it('inserts a vertex at a segment midpoint', () => {
    expect(insertMidpoint(zigzag, 1)).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 5 },
      { x: 10, y: 10 },
    ]);
  });

  it('ignores a segment index past the end', () => {
    expect(insertMidpoint(zigzag, 5)).toEqual(zigzag);
  });
});

describe('drawing', () => {
  it('adds points and removes the last one on Backspace', () => {
    const drawn = appendPoint(appendPoint([], { x: 1, y: 1 }), { x: 2, y: 2 });
    expect(drawn).toHaveLength(2);
    expect(removeLastPoint(drawn)).toEqual([{ x: 1, y: 1 }]);
    expect(removeLastPoint([])).toEqual([]);
  });

  it('skips a point on top of the last one, as a double-click adds', () => {
    expect(appendPoint([{ x: 1, y: 1 }], { x: 1.01, y: 1 })).toHaveLength(1);
  });

  it('finishes only with two or more points', () => {
    expect(finishPath([{ x: 0, y: 0 }])).toEqual({ kind: 'too-short' });
    expect(finishPath(zigzag)).toEqual({ kind: 'finished', points: zigzag });
  });
});

describe('grades', () => {
  it('colours green to 5 percent, amber to 8 and red above', () => {
    expect(gradeStatus(0.05)).toBe('success');
    expect(gradeStatus(0.06)).toBe('warning');
    expect(gradeStatus(0.08)).toBe('warning');
    expect(gradeStatus(0.081)).toBe('danger');
  });

  it('measures each segment as rise over run', () => {
    const elevation = (point: { x: number; y: number }) => point.x * 0.1;
    expect(segmentGrades(zigzag, elevation)).toEqual([0.1, 0]);
  });
});
