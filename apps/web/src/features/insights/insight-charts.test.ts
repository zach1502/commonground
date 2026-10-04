import { describe, expect, it } from 'vitest';

import { HEATMAP_LAYERS } from '@parkshape/core';

import type { Insights } from '../../api/staff-api';
import fixture from '../../test/insights-fixture.json' with { type: 'json' };

import {
  averageText,
  baselineRows,
  complianceRows,
  designReasonRows,
  earthworksBins,
  engagementRows,
  featureBars,
  featureShareBars,
  headlineItems,
  heatmapGroups,
  reasonBars,
  splitZeroBars,
} from './insight-charts';

const INSIGHTS = fixture as Insights;

describe('insight charts', () => {
  it('lists the three headline counts in order', () => {
    expect(headlineItems(INSIGHTS.headline)).toEqual([
      { id: 'designsSubmitted', term: 'designs submitted', value: '3' },
      { id: 'uniqueVoters', term: 'unique voters', value: '6' },
      { id: 'votesCast', term: 'votes cast', value: '7' },
    ]);
  });

  it('shows the six mapped features always and others only when used', () => {
    const ids = featureShareBars(INSIGHTS.features).map((bar) => bar.id);
    expect(ids).toEqual(['tree', 'path', 'water', 'play', 'seating', 'garden', 'dog']);
    expect(featureShareBars(INSIGHTS.features)[0]).toEqual({
      id: 'tree',
      label: 'Trees',
      value: 66.7,
    });
    expect(averageText(1.25)).toBe('1.3');
  });

  it('merges the count of designs and the average into one bar per feature', () => {
    expect(featureBars(INSIGHTS.features, INSIGHTS.headline.designsSubmitted)[0]).toEqual({
      id: 'tree',
      label: 'Trees',
      value: 66.7,
      valueText: '2 of 3 designs, 1.3 each',
    });
  });

  it('sorts the feature bars from most to least, keeping catalog order on a tie', () => {
    const bars = featureBars(
      [
        { category: 'path', designsWithPercent: 40, averageCount: 1 },
        { category: 'tree', designsWithPercent: 93.3, averageCount: 3.1 },
        { category: 'seating', designsWithPercent: 40, averageCount: 2 },
        { category: 'play', designsWithPercent: 0, averageCount: 0 },
      ],
      30,
    );
    expect(bars.map((bar) => bar.id)).toEqual(['tree', 'path', 'seating', 'play']);
    expect(bars[0]?.valueText).toBe('28 of 30 designs, 3.1 each');
  });

  it('splits bars into the ones with a value and the zero rows', () => {
    const bars = [
      { id: 'a', label: 'A', value: 2 },
      { id: 'b', label: 'B', value: 0 },
    ];
    expect(splitZeroBars(bars)).toEqual({ shown: [bars[0]], zero: [bars[1]] });
  });

  it('names reasons with the chip words and sorts each design by count', () => {
    expect(reasonBars(INSIGHTS.reasons, 'up')[1]).toMatchObject({ label: 'Trees', value: 6 });
    expect(designReasonRows(INSIGHTS.reasons).map((row) => row.named)).toEqual([
      'Trees 6, Paths 5',
      'Too expensive 1',
      'None named',
    ]);
  });
});

describe('insight tables', () => {
  it('labels rules, bins and baseline features for tables and charts', () => {
    expect(complianceRows(INSIGHTS.compliance)[0]).toMatchObject({
      label: 'Budget',
      ok: 1,
      fail: 1,
    });
    expect(earthworksBins(INSIGHTS.earthworks)[0]).toEqual({
      id: '-50',
      label: '-50 to 0',
      count: 1,
    });
    expect(baselineRows(INSIGHTS.baselineDiff)[1]).toEqual({
      kind: 'changed',
      id: 'garden-1',
      label: 'Community garden in the south-east',
      moved: '0',
      removed: '33.3',
      resized: '66.7',
    });
  });

  it('tells two features with one name apart by where they are, never by id', () => {
    const labels = baselineRows(INSIGHTS.baselineDiff).map((row) => row.label);
    expect(labels).toEqual([
      'Garry oak in the north, 1 of 2',
      'Community garden in the south-east',
      '1 other feature, unchanged in every design',
    ]);
  });
});

describe('insight baseline fold', () => {
  it('folds every unchanged feature into one final row and shows no zero rows', () => {
    const zero = { kind: 'item', movedPercent: 0, removedPercent: 0, resizedPercent: 0 } as const;
    const diff: Insights['baselineDiff'] = [
      { ...zero, featureId: 'a', label: 'Bench', where: 'north' },
      { ...zero, featureId: 'b', label: 'Garry oak', where: 'south', movedPercent: 10 },
      { ...zero, featureId: 'c', label: 'Red alder', where: 'east' },
    ];
    const rows = baselineRows(diff);
    expect(rows.map((row) => row.kind)).toEqual(['changed', 'unchanged']);
    expect(rows[1]).toEqual({
      kind: 'unchanged',
      id: 'unchanged',
      label: '2 other features, unchanged in every design',
    });
  });

  it('shows only the folded row when no design changed anything', () => {
    const zero = { kind: 'item', movedPercent: 0, removedPercent: 0, resizedPercent: 0 } as const;
    const rows = baselineRows([{ ...zero, featureId: 'a', label: 'Bench', where: 'north' }]);
    expect(rows).toEqual([
      { kind: 'unchanged', id: 'unchanged', label: '1 other feature, unchanged in every design' },
    ]);
    expect(baselineRows([])).toEqual([]);
  });

  it('shows suppressed engagement groups as under 5 and names the unanswered group', () => {
    const rows = engagementRows(INSIGHTS.engagement.byFsa, (fsa) => fsa);
    expect(rows).toEqual([
      { id: 'V5T', group: 'V5T', people: '9' },
      { id: 'V6A', group: 'V6A', people: 'under 5' },
      { id: 'none', group: 'Did not answer', people: 'under 5' },
    ]);
  });
});

describe('reason bars', () => {
  it('sorts the reason bars by count, most named first, and ties by name', () => {
    expect(reasonBars(INSIGHTS.reasons, 'up').map((bar) => [bar.label, bar.value])).toEqual([
      ['Paths', 6],
      ['Trees', 6],
      ['Play', 0],
      ['Too expensive', 0],
    ]);
  });

  it('keeps the catch-all Other last even when it has the highest count', () => {
    const reasons = {
      down: [
        { reason: 'other', count: 67 },
        { reason: 'trees', count: 40 },
        { reason: 'paths', count: 30 },
      ],
      byDesign: [],
    } as unknown as Insights['reasons'];
    expect(reasonBars(reasons, 'down').map((bar) => bar.label)).toEqual([
      'Trees',
      'Paths',
      'Other',
    ]);
  });
});

describe('heatmap switcher options', () => {
  it('groups the layers as paths and grading, planting, places, then services', () => {
    const groups = heatmapGroups();
    expect(groups.map((group) => group.label)).toEqual([
      'Paths and grading',
      'Planting',
      'Places to play and sit',
      'Services',
    ]);
    expect(groups.map((group) => group.options.map((option) => option.label))).toEqual([
      ['Paths', 'Desire lines', 'Regrading'],
      ['Trees', 'Shrubs', 'Gardens', 'Lawn and meadow'],
      ['Play', 'Seating', 'Dog areas', 'Sports', 'Water', 'Plazas'],
      ['Lights', 'Washrooms', 'Parking', 'Fountains, bins and racks'],
    ]);
  });

  it('offers every layer once', () => {
    const layers = heatmapGroups().flatMap((group) => group.options.map((option) => option.value));
    expect([...layers].sort()).toEqual([...HEATMAP_LAYERS].sort());
  });
});
