import { describe, expect, it } from 'vitest';

import { deltaField, mergeGradeDelta, subtractGradeDelta } from './grade-delta.js';

describe('mergeGradeDelta', () => {
  it('coalesces cells that share a position', () => {
    const merged = mergeGradeDelta(
      { cells: [{ x: 1, y: 1, deltaM: 2 }] },
      { cells: [{ x: 1, y: 1, deltaM: 3 }] },
    );
    expect(merged.cells).toEqual([{ x: 1, y: 1, deltaM: 5 }]);
  });

  it('drops cells that coalesce to zero, keeping the delta sparse', () => {
    const merged = mergeGradeDelta(
      { cells: [{ x: 2, y: 3, deltaM: 4 }] },
      { cells: [{ x: 2, y: 3, deltaM: -4 }] },
    );
    expect(merged.cells).toHaveLength(0);
  });
});

describe('subtractGradeDelta', () => {
  it('is the inverse of a merge', () => {
    const startCells = [{ x: 0, y: 0, deltaM: 1 }];
    const patch = {
      cells: [
        { x: 0, y: 0, deltaM: 2 },
        { x: 1, y: 0, deltaM: 3 },
      ],
    };
    const merged = mergeGradeDelta({ cells: startCells }, patch);
    const back = subtractGradeDelta(merged, patch);
    expect(back.cells).toEqual(startCells);
  });
});

describe('deltaField', () => {
  it('sums repeated cells by flat index', () => {
    const field = deltaField(4, {
      cells: [
        { x: 1, y: 1, deltaM: 2 },
        { x: 1, y: 1, deltaM: 3 },
      ],
    });
    expect(field.get(5)).toBe(5);
  });
});
