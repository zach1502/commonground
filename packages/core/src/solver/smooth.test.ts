import { describe, expect, it } from 'vitest';

import { catmullRom, everyNth, withoutCollinear, withoutRepeats } from './smooth.js';

describe('catmullRom', () => {
  it('passes through every control point', () => {
    const controls = [
      { x: 0, y: 0 },
      { x: 4, y: 2 },
      { x: 8, y: 0 },
    ];
    const curve = catmullRom(controls, 4);
    expect(curve[0]).toEqual({ x: 0, y: 0 });
    expect(curve[4]?.x).toBeCloseTo(4);
    expect(curve[4]?.y).toBeCloseTo(2);
    expect(curve.at(-1)).toEqual({ x: 8, y: 0 });
    expect(curve).toHaveLength(9);
  });

  it('keeps a straight line straight', () => {
    const curve = catmullRom(
      [
        { x: 0, y: 0 },
        { x: 3, y: 0 },
      ],
      3,
    );
    expect(curve.map((point) => point.y)).toEqual([0, 0, 0, 0]);
    const xs = curve.map((point) => point.x);
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
  });
});

describe('everyNth', () => {
  it('keeps both ends and every nth point between', () => {
    expect(everyNth([1, 2, 3, 4, 5, 6], 2)).toEqual([1, 3, 5, 6]);
    expect(everyNth([1], 3)).toEqual([1]);
  });
});

describe('withoutCollinear', () => {
  it('drops points on a straight run', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
    ];
    expect(withoutCollinear(points)).toEqual([points[0], points[2], points[3]]);
  });
});

describe('withoutCollinear at a turn back', () => {
  it('keeps the far end of a path that runs out and straight back', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
    ];
    expect(withoutCollinear(points)).toEqual([points[0], points[2], points[3], points[4]]);
  });
});

describe('withoutRepeats', () => {
  it('drops a point equal to the one before it and keeps a loop closed', () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
      { x: 0, y: 0 },
    ];
    expect(withoutRepeats(points)).toEqual([points[0], points[1], points[3], points[4]]);
  });
});
