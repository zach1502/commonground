import { describe, expect, it } from 'vitest';

import { defaultParameters } from '@parkshape/core';

import {
  draftFrom,
  moneyText,
  parseDraft,
  type FormMessages,
  type ParametersDraft,
} from './parameters-form';

const MESSAGES: FormMessages = {
  notNumber: 'Enter a number.',
  required: 'Fill this in.',
  whole: 'Enter a whole number.',
  atLeast: 'Enter {min} or more.',
  above: 'Enter more than {min}.',
  between: 'Enter a number from {min} to {max}.',
  minAboveMax: 'The most must be at least the fewest.',
};

const base = defaultParameters();

function withNumber(draft: ParametersDraft, id: keyof ParametersDraft['numbers'], value: string) {
  return { ...draft, numbers: { ...draft.numbers, [id]: value } };
}

describe('parameters form', () => {
  it('turns the defaults into text and back without change', () => {
    const result = parseDraft(draftFrom(base), base, MESSAGES);
    expect(result).toEqual({ kind: 'valid', parameters: base });
  });

  it('shows slopes as percent and stores them as rise over run', () => {
    const draft = draftFrom(base);
    expect(draft.numbers.maxRunningSlope).toBe('5');
    const result = parseDraft(withNumber(draft, 'maxRunningSlope', '8'), base, MESSAGES);
    expect(result.kind === 'valid' ? result.parameters.slopes.maxRunning : 0).toBeCloseTo(0.08);
  });

  it('takes a new canopy target and a garden plot minimum', () => {
    const draft = withNumber(
      withNumber(draftFrom(base), 'canopyMin', '35'),
      'gardenMinPlots',
      '24',
    );
    const result = parseDraft(draft, base, MESSAGES);
    if (result.kind !== 'valid') throw new Error('expected valid');
    expect(result.parameters.canopy.minPercent).toBe(35);
    expect(result.parameters.requiredFeatures).toEqual([
      { category: 'garden', minCount: 1, minPlots: 24 },
    ]);
  });
});

describe('parameters form money', () => {
  it('writes money with thousands separators and reads it back with or without them', () => {
    const draft = draftFrom(base);
    expect(draft.numbers.budgetTotal).toBe('1,500,000');
    const result = parseDraft(withNumber(draft, 'budgetTotal', '$1,200,000'), base, MESSAGES);
    expect(result.kind === 'valid' ? result.parameters.budget.totalCad : 0).toBe(1_200_000);
  });

  it('adds separators to typed money text as the planner leaves it', () => {
    expect(moneyText('1200000')).toBe('1,200,000');
    expect(moneyText('25')).toBe('25');
    expect(moneyText('lots')).toBe('lots');
  });
});

describe('parameters form errors', () => {
  it('names the problem next to each bad field', () => {
    let draft = withNumber(draftFrom(base), 'canopyMin', '120');
    draft = withNumber(draft, 'budgetTotal', 'lots');
    draft = withNumber(draft, 'gardenMinPlots', '2.5');
    draft = withNumber(draft, 'maxDeviationM', '0');
    draft = withNumber(draft, 'cutPerM3', '-1');
    draft = withNumber(draft, 'haulPerM3', '');
    const result = parseDraft({ ...draft, brief: ' ' }, base, MESSAGES);
    expect(result).toEqual({
      kind: 'invalid',
      errors: {
        canopyMin: 'Enter a number from 0 to 100.',
        budgetTotal: 'Enter a number.',
        gardenMinPlots: 'Enter a whole number.',
        maxDeviationM: 'Enter more than 0.',
        cutPerM3: 'Enter 0 or more.',
        haulPerM3: 'Fill this in.',
        brief: 'Fill this in.',
      },
    });
  });
});

describe('parameters form counts and limits', () => {
  it('keeps optional limits empty and adds counts that are filled in', () => {
    const draft = draftFrom(base);
    expect(draft.numbers.maxNetHaulM3).toBe('');
    const counts = {
      ...draft.counts,
      seating: { min: '2', max: '6' },
      play: { min: '', max: '1' },
    };
    const disturbed = withNumber({ ...draft, counts }, 'maxDisturbedPercent', '15');
    const result = parseDraft(disturbed, base, MESSAGES);
    if (result.kind !== 'valid') throw new Error('expected valid');
    expect(result.parameters.counts).toEqual([
      { category: 'play', max: 1 },
      { category: 'seating', min: 2, max: 6 },
    ]);
    expect(result.parameters.terraform.maxDisturbedPercent).toBe(15);
    expect(draftFrom(result.parameters).counts.seating).toEqual({ min: '2', max: '6' });
  });

  it('refuses a count range whose fewest is above its most', () => {
    const draft = draftFrom(base);
    const counts = { ...draft.counts, tree: { min: '9', max: '3' }, shrub: { min: 'x', max: '' } };
    const result = parseDraft({ ...draft, counts }, base, MESSAGES);
    expect(result).toEqual({
      kind: 'invalid',
      errors: {
        'count-tree-max': 'The most must be at least the fewest.',
        'count-shrub-min': 'Enter a number.',
      },
    });
  });

  it('carries each severity choice through', () => {
    const draft = draftFrom(base);
    const result = parseDraft(
      { ...draft, severity: { ...draft.severity, budget: 'hard' } },
      base,
      MESSAGES,
    );
    expect(result.kind === 'valid' ? result.parameters.severity.budget : null).toBe('hard');
  });
});
