import { describe, expect, it } from 'vitest';

import { ALL_STEPS, findPath, stepBit, type CostGrid } from './astar.js';

function open(width: number, height: number): CostGrid {
  return { width, height, cellM: 1, cost: new Float64Array(width * height).fill(1) };
}

describe('findPath', () => {
  it('walks a straight corridor cell by cell', () => {
    expect(findPath(open(5, 1), 0, 4)).toEqual([0, 1, 2, 3, 4]);
  });

  it('returns the start alone when start and goal are the same cell', () => {
    expect(findPath(open(3, 3), 4, 4)).toEqual([4]);
  });

  it('goes through the gap in a wall and never through a blocked cell', () => {
    const grid = open(5, 5);
    // A wall down column 2 with a gap at the top row.
    [2, 7, 12, 17].forEach((index) => {
      grid.cost[index] = Infinity;
    });
    const path = findPath(grid, 10, 14);
    expect(path).toBeDefined();
    expect(path?.some((index) => grid.cost[index] === Infinity)).toBe(false);
    expect(path).toContain(22);
  });

  it('does not cut a corner between two blocked cells', () => {
    const grid = open(2, 2);
    grid.cost[1] = Infinity;
    grid.cost[2] = Infinity;
    expect(findPath(grid, 0, 3)).toBeUndefined();
  });

  it('takes a longer way round a costly band when that costs less', () => {
    const grid = open(7, 4);
    // Column 3 is steep except in the top row.
    [3, 10, 17].forEach((index) => {
      grid.cost[index] = 1000;
    });
    const path = findPath(grid, 0, 6) ?? [];
    expect(path.filter((index) => index % 7 === 3)).toEqual([24]);
  });

  it('costs a diagonal step the square root of 2', () => {
    expect(findPath(open(3, 3), 0, 8)).toEqual([0, 4, 8]);
  });
});

describe('findPath with a step mask', () => {
  it('takes only the steps the step mask allows', () => {
    const grid = open(3, 3);
    const steps = new Uint8Array(9).fill(ALL_STEPS);
    // No step east out of the middle row, so the route must leave it.
    [3, 4].forEach((index) => {
      steps[index] = ALL_STEPS & ~stepBit(1, 0);
    });
    const path = findPath({ ...grid, steps }, 3, 5) ?? [];
    expect(path[0]).toBe(3);
    expect(path.at(-1)).toBe(5);
    const eastInMiddleRow = path.some(
      (cell, k) => cell < 5 && cell >= 3 && path[k + 1] === cell + 1,
    );
    expect(eastInMiddleRow).toBe(false);
  });

  it('finds no route when the step mask allows none', () => {
    const steps = new Uint8Array(3);
    expect(findPath({ ...open(3, 1), steps }, 0, 2)).toBeUndefined();
  });

  it('takes a masked step at its penalty when there is no other way', () => {
    const steps = new Uint8Array(3).fill(ALL_STEPS);
    steps[1] = ALL_STEPS & ~stepBit(1, 0);
    const grid = { ...open(3, 1), steps, stepPenalty: 100 };
    expect(findPath(grid, 0, 2)).toEqual([0, 1, 2]);
  });

  it('goes round a masked step when the detour costs less than its penalty', () => {
    const steps = new Uint8Array(9).fill(ALL_STEPS);
    steps[4] = ALL_STEPS & ~stepBit(1, 0);
    const path = findPath({ ...open(3, 3), steps, stepPenalty: 100 }, 3, 5) ?? [];
    expect(path.some((cell, k) => cell === 4 && path[k + 1] === 5)).toBe(false);
    expect(path.at(-1)).toBe(5);
  });
});
