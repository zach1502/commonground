import { describe, expect, it } from 'vitest';

import {
  budgetOutcome,
  canopyOutcome,
  countsOutcome,
  featuresOutcome,
  imperviousOutcome,
} from './constraints.js';
import { parametersWith } from './fixtures/design-builders.js';

describe('budgetOutcome', () => {
  it('passes a design within budget', () => {
    expect(budgetOutcome(412000, 500000)).toEqual({
      met: true,
      value: 412000,
      limit: 500000,
      message: 'Design costs $412,000 of the $500,000 budget.',
    });
  });

  it('states the overrun and what to do', () => {
    expect(budgetOutcome(612300, 500000).message).toBe(
      'Design costs $612,300, which is $112,300 over the $500,000 budget. Remove items or choose lower-cost surfaces.',
    );
  });
});

describe('canopyOutcome', () => {
  it('passes at or above the minimum', () => {
    expect(canopyOutcome(30, 30)).toMatchObject({ met: true, value: 30, limit: 30 });
  });

  it('asks for more trees below the minimum', () => {
    expect(canopyOutcome(18.24, 30).message).toBe(
      'Tree canopy covers 18.2% of the park. Plant trees to reach 30%.',
    );
  });
});

describe('imperviousOutcome', () => {
  it('passes at or below the maximum', () => {
    expect(imperviousOutcome(12, 35)).toMatchObject({
      met: true,
      message: 'Hard surfaces cover 12% of the park, within the 35% limit.',
    });
  });

  it('asks for fewer hard surfaces above the maximum', () => {
    expect(imperviousOutcome(40.2, 35)).toMatchObject({
      met: false,
      message:
        'Hard surfaces cover 40.2% of the park. Replace some with planting to reach 35% or less.',
    });
  });
});

describe('featuresOutcome', () => {
  const [garden] = parametersWith().requiredFeatures;
  const { requiredFeatures } = parametersWith({
    requiredFeatures: [{ catalogId: 'bench', minCount: 2 }],
  });

  it('passes when nothing is short', () => {
    expect(featuresOutcome([])).toEqual({
      met: true,
      value: 0,
      limit: 0,
      message: 'The design has every required feature.',
    });
  });

  it('names a missing feature', () => {
    const [bench] = requiredFeatures;
    if (bench === undefined || garden === undefined) throw new Error('fixture');
    expect(featuresOutcome([{ feature: bench, count: 1, plots: 0 }]).message).toBe(
      'The design has 1 bench item. Add at least 2.',
    );
    expect(featuresOutcome([{ feature: garden, count: 0, plots: 0 }]).message).toBe(
      'The design has 0 garden items. Add at least 1.',
    );
  });

  it('names a plot shortfall', () => {
    if (garden === undefined) throw new Error('fixture');
    expect(featuresOutcome([{ feature: garden, count: 1, plots: 18 }])).toMatchObject({
      met: false,
      value: 1,
      message: 'Garden areas fit 18 plots. Make them larger to fit 20.',
    });
  });
});

describe('countsOutcome', () => {
  it('passes when every category is in range', () => {
    expect(countsOutcome([]).message).toBe('Every category is within its count range.');
  });

  it('states an excess and a shortage', () => {
    expect(countsOutcome([{ category: 'seating', count: 12, max: 10 }]).message).toBe(
      'The design has 12 seating items. The limit is 10.',
    );
    expect(countsOutcome([{ category: 'play', count: 0, min: 1 }])).toMatchObject({
      met: false,
      value: 1,
      message: 'The design has 0 play items. Add at least 1.',
    });
  });
});

describe('constraint boundaries', () => {
  it('meets a budget spent to the dollar and misses it one dollar over', () => {
    expect(budgetOutcome(500000, 500000).met).toBe(true);
    expect(budgetOutcome(500001, 500000).met).toBe(false);
  });

  it('meets an impervious limit exactly at 35 percent and misses it at 35.1', () => {
    expect(imperviousOutcome(35, 35).met).toBe(true);
    expect(imperviousOutcome(35.1, 35).met).toBe(false);
  });

  it('asks for more, not fewer, when a count with both bounds falls short', () => {
    expect(countsOutcome([{ category: 'seating', count: 1, min: 2, max: 5 }]).message).toBe(
      'The design has 1 seating item. Add at least 2.',
    );
    expect(countsOutcome([{ category: 'seating', count: 6, min: 2, max: 5 }]).message).toBe(
      'The design has 6 seating items. The limit is 5.',
    );
  });
});
