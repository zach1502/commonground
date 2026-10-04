import { describe, expect, it } from 'vitest';

import { earthworksHistogram } from './earthworks-histogram.js';
import { syntheticDesign } from './fixtures.js';

const MIN_BINS = 5;

function designsAt(nets: readonly number[]) {
  return nets.map((netM3, index) =>
    syntheticDesign({ id: String(index), metrics: { netM3, constraints: {} } }),
  );
}

describe('earthworksHistogram edges', () => {
  it('puts a net exactly on a bin edge in the bin that starts there', () => {
    const { binM3, bins } = earthworksHistogram(designsAt([50, 100]));
    expect(binM3).toBe(10);
    expect(bins[0]).toEqual({ fromM3: 50, toM3: 60, count: 1 });
    expect(bins[bins.length - 1]).toEqual({ fromM3: 100, toM3: 110, count: 1 });
  });

  it('keeps 50 m3 bins when the data spans 5 of them', () => {
    const { binM3, bins } = earthworksHistogram(designsAt([0, 120, 240]));
    expect(binM3).toBe(50);
    expect(bins).toHaveLength(MIN_BINS);
  });
});

describe('earthworksHistogram with few distinct values', () => {
  it('draws at least 5 bins when every design moves the same soil', () => {
    const { binM3, bins } = earthworksHistogram(designsAt([0, 0, 0, 0]));
    expect(bins.length).toBeGreaterThanOrEqual(MIN_BINS);
    expect(binM3).toBe(50);
    expect(bins.map(({ count }) => count)).toEqual([0, 0, 4, 0, 0]);
    expect(bins[2]).toEqual({ fromM3: 0, toM3: 50, count: 4 });
  });

  it('uses a smaller step, never under 1 m3, so a narrow range still has 5 bins', () => {
    const { binM3, bins } = earthworksHistogram(designsAt([3, 4, 7]));
    expect(binM3).toBe(1);
    expect(bins.length).toBeGreaterThanOrEqual(MIN_BINS);
    expect(bins.reduce((total, bin) => total + bin.count, 0)).toBe(3);
  });

  it('has no bins with no measured designs', () => {
    expect(earthworksHistogram([]).bins).toEqual([]);
  });
});
