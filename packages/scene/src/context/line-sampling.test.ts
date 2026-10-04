import { describe, expect, it } from 'vitest';

import { dashesOf, densify } from './line-sampling.js';

const straight = [
  { x: 0, z: 0 },
  { x: 10, z: 0 },
];

describe('densify', () => {
  it('adds points so no step is longer than the step the ground asks for', () => {
    const points = densify(straight, () => 2);
    expect(points).toHaveLength(6);
    expect(points.at(-1)).toEqual({ x: 10, z: 0 });
  });

  it('keeps a short line as it is', () => {
    expect(densify(straight, () => 20)).toEqual(straight);
  });

  it('samples finely only where the ground asks for it', () => {
    const points = densify(
      [
        { x: 0, z: 0 },
        { x: 100, z: 0 },
      ],
      (point) => (point.x < 10 ? 2 : 50),
    );
    expect(points.filter((point) => point.x < 10).length).toBe(5);
    expect(points.length).toBeLessThan(10);
  });
});

describe('dashesOf', () => {
  it('splits a 20 m line into five 2 m dashes with 2 m gaps', () => {
    const dashes = dashesOf(
      [
        { x: 0, z: 0 },
        { x: 20, z: 0 },
      ],
      2,
    );
    expect(dashes).toHaveLength(5);
    expect(dashes[1]).toEqual([
      { x: 4, z: 0 },
      { x: 6, z: 0 },
    ]);
  });

  it('keeps the corner inside a dash that runs round it', () => {
    const dashes = dashesOf(
      [
        { x: 0, z: 0 },
        { x: 1, z: 0 },
        { x: 1, z: 5 },
      ],
      2,
    );
    expect(dashes[0]).toEqual([
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      { x: 1, z: 1 },
    ]);
  });
});
