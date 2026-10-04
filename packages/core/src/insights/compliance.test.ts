import { describe, expect, it } from 'vitest';

import { complianceDistribution } from './compliance.js';
import { earthworksHistogram } from './earthworks-histogram.js';
import { syntheticDesign } from './fixtures.js';

const withMetrics = (id: string, netM3: number, budget: 'ok' | 'warn' | 'fail') =>
  syntheticDesign({ id, metrics: { netM3, constraints: { budget, canopy: 'warn' } } });

const designs = [
  withMetrics('a', -120, 'ok'),
  withMetrics('b', 0, 'warn'),
  withMetrics('c', 49.9, 'fail'),
  withMetrics('d', 160, 'ok'),
  syntheticDesign({ id: 'no-metrics' }),
];

describe('complianceDistribution', () => {
  // Built inside each test, so a bug that throws fails that test instead of the whole file.
  const rows = () => complianceDistribution(designs);

  it('counts ok, warn and fail per constraint across designs with metrics', () => {
    expect(rows().find((row) => row.key === 'budget')).toEqual({
      key: 'budget',
      ok: 2,
      warn: 1,
      fail: 1,
    });
    expect(rows().find((row) => row.key === 'canopy')).toMatchObject({ warn: 4 });
  });

  it('lists every constraint key, with zeros where no design reported it', () => {
    expect(rows()).toHaveLength(9);
    expect(rows().find((row) => row.key === 'slopes')).toEqual({
      key: 'slopes',
      ok: 0,
      warn: 0,
      fail: 0,
    });
  });
});

describe('earthworksHistogram', () => {
  it('bins net volume in 50 m3 steps from the lowest bin to the highest', () => {
    const histogram = earthworksHistogram(designs);
    expect(histogram.binM3).toBe(50);
    expect(histogram.bins.map((bin) => [bin.fromM3, bin.toM3, bin.count])).toEqual([
      [-150, -100, 1],
      [-100, -50, 0],
      [-50, 0, 0],
      [0, 50, 2],
      [50, 100, 0],
      [100, 150, 0],
      [150, 200, 1],
    ]);
  });

  it('has no bins when no design has metrics', () => {
    expect(earthworksHistogram([syntheticDesign({ id: 'x' })]).bins).toEqual([]);
  });
});
