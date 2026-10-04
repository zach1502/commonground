import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MAX_CROSS_SLOPE,
  DEFAULT_MAX_RUNNING_SLOPE,
  DEFAULT_SCORE_PRIOR,
  DEFAULT_TERRAFORM_LIMIT_M,
  ROOT_ZONE_RADIUS_PER_DBH_CM,
} from '../constants.js';

import {
  CONSTRAINT_KEYS,
  defaultParameters,
  projectParametersSchema,
  type ProjectParametersInput,
} from './parameters.js';

const minimal: ProjectParametersInput = {
  budget: { totalCad: 100000, earthworks: { cutPerM3: 20, fillPerM3: 30, haulPerM3: 15 } },
  canopy: { minPercent: 20 },
  impervious: { maxPercent: 40 },
  requiredFeatures: [],
  forbiddenZones: [],
  counts: [],
  brief: 'A small park.',
  severity: {
    budget: 'soft',
    canopy: 'soft',
    impervious: 'soft',
    requiredFeatures: 'hard',
    forbiddenZones: 'hard',
    slopes: 'soft',
    counts: 'soft',
    terraform: 'soft',
    treeProtection: 'soft',
  },
};

describe('projectParametersSchema', () => {
  it('fills slope, terraform, tree protection and prior defaults from constants', () => {
    const parsed = projectParametersSchema.parse(minimal);
    expect(parsed.slopes).toEqual({
      maxRunning: DEFAULT_MAX_RUNNING_SLOPE,
      maxCross: DEFAULT_MAX_CROSS_SLOPE,
    });
    expect(parsed.terraform).toEqual({ maxDeviationM: DEFAULT_TERRAFORM_LIMIT_M });
    expect(parsed.treeProtection).toEqual({ rootZonePerDbhCm: ROOT_ZONE_RADIUS_PER_DBH_CM });
    expect(parsed.scoringPrior).toEqual(DEFAULT_SCORE_PRIOR);
  });

  it('round-trips through JSON', () => {
    const parsed = projectParametersSchema.parse(minimal);
    expect(projectParametersSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('requires a severity for every constraint key', () => {
    const severity = Object.fromEntries(
      Object.entries(minimal.severity).filter(([key]) => key !== 'treeProtection'),
    );
    expect(projectParametersSchema.safeParse({ ...minimal, severity }).success).toBe(false);
  });

  it('accepts required features by category or by catalog id, but not both', () => {
    const byCategory = { category: 'garden', minCount: 1, minPlots: 20 };
    const byCatalogId = { catalogId: 'washroom-building', minCount: 1 };
    const ok = projectParametersSchema.safeParse({
      ...minimal,
      requiredFeatures: [byCategory, byCatalogId],
    });
    expect(ok.success).toBe(true);
    const both = { ...byCategory, catalogId: 'bench' };
    expect(
      projectParametersSchema.safeParse({ ...minimal, requiredFeatures: [both] }).success,
    ).toBe(false);
  });

  it('rejects percentages above 100 and a count range with min above max', () => {
    expect(
      projectParametersSchema.safeParse({ ...minimal, canopy: { minPercent: 120 } }).success,
    ).toBe(false);
    const counts = [{ category: 'seating', min: 5, max: 2 }];
    expect(projectParametersSchema.safeParse({ ...minimal, counts }).success).toBe(false);
  });
});

describe('defaultParameters', () => {
  it('returns the Jonathan Rogers demo values', () => {
    const parameters = defaultParameters();
    expect(parameters.budget.totalCad).toBe(500000);
    expect(parameters.canopy.minPercent).toBe(30);
    expect(parameters.impervious.maxPercent).toBe(35);
    expect(parameters.requiredFeatures).toEqual([
      { category: 'garden', minCount: 1, minPlots: 20 },
    ]);
    expect(parameters.brief.length).toBeGreaterThan(0);
  });

  it('marks only required features and forbidden zones as hard', () => {
    const hard = CONSTRAINT_KEYS.filter((key) => defaultParameters().severity[key] === 'hard');
    expect(hard).toEqual(['requiredFeatures', 'forbiddenZones']);
  });

  it('passes its own schema and returns a fresh copy each call', () => {
    const first = defaultParameters();
    expect(projectParametersSchema.parse(first)).toEqual(first);
    expect(defaultParameters()).not.toBe(first);
  });
});

describe('count ranges', () => {
  it('accepts a range whose min equals its max', () => {
    const counts = [{ category: 'seating', min: 2, max: 2 }];
    expect(projectParametersSchema.safeParse({ ...minimal, counts }).success).toBe(true);
  });
});
