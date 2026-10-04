import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';
import { itemAt, rectangle, rectangleParcel } from '../metrics/fixtures/design-builders.js';

import { computeInsights, insightsGrid } from './compute-insights.js';
import { syntheticDesign, TEN_BY_TEN } from './fixtures.js';
import { HEATMAP_LAYERS } from './heatmaps.js';

const designs = [
  syntheticDesign({
    id: 'a',
    parts: { items: [itemAt('t1', 'garry-oak', 2.5, 2.5)] },
    metrics: { netM3: 10, constraints: { budget: 'ok' } },
  }),
  syntheticDesign({
    id: 'b',
    parts: {
      areas: [
        { id: 'g1', catalogId: 'community-garden', polygon: rectangle(0, 0, 4, 4), locked: false },
      ],
    },
    metrics: { netM3: -60, constraints: { budget: 'fail' } },
  }),
];

describe('computeInsights', () => {
  // Built inside each test, so a bug that throws fails that test instead of the whole file.
  const insights = () =>
    computeInsights({
      designs,
      votes: [
        { designId: 'a', userId: 'u1', value: 1, reasons: ['trees'] },
        { designId: 'b', userId: 'u1', value: -1, reasons: [] },
        { designId: 'a', userId: 'u2', value: 1, reasons: ['trees', 'play'] },
      ],
      participants: [{ userId: 'u1', selfReport: null }],
      baseline: null,
      catalog: catalogIndex,
      grid: TEN_BY_TEN,
    });

  it('puts the headline numbers first', () => {
    expect(Object.keys(insights())[0]).toBe('headline');
    expect(insights().headline).toEqual({ designsSubmitted: 2, uniqueVoters: 2, votesCast: 3 });
  });

  it('joins every aggregate over the same designs', () => {
    expect(insights().features.find((row) => row.category === 'tree')?.designsWithPercent).toBe(50);
    expect(insights().heatmaps.map((map) => map.category)).toEqual([...HEATMAP_LAYERS]);
    expect(insights().compliance.find((row) => row.key === 'budget')).toMatchObject({
      ok: 1,
      fail: 1,
    });
    expect(insights().earthworks.bins.length).toBeGreaterThanOrEqual(5);
    expect(insights().reasons.overall.find((row) => row.reason === 'trees')?.count).toBe(2);
    expect(insights().baselineDiff).toEqual([]);
    expect(insights().engagement.byFsa).toEqual([{ group: null, count: null, suppressed: true }]);
  });

  it('builds the grid over the parcel at 1 m', () => {
    expect(insightsGrid(rectangleParcel(12, 8))).toEqual({
      width: 12,
      height: 8,
      cellM: 1,
      originLocal: { x: 0, y: 0 },
    });
  });
});
