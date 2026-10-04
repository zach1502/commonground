import { describe, expect, it } from 'vitest';

import { gridCellCount } from './grid.js';

describe('gridCellCount', () => {
  it('counts whole and partial cells', () => {
    expect(gridCellCount(10, 20)).toBe(200);
    expect(gridCellCount(1.5, 1)).toBe(2);
    expect(gridCellCount(0, 5)).toBe(0);
  });
});
