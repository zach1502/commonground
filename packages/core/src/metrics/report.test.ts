import { describe, expect, it } from 'vitest';

import { CONSTRAINT_KEYS, type ConstraintKey } from '../schema/parameters.js';

import { parametersWith } from './fixtures/design-builders.js';
import type { ConstraintOutcome } from './outcome.js';
import {
  buildReport,
  failedConstraints,
  isSubmittable,
  requireSubmittable,
  type MetricsTotals,
} from './report.js';

const met: ConstraintOutcome = { met: true, value: 0, limit: 0, message: 'Fine.' };
const missed: ConstraintOutcome = { met: false, value: 2, limit: 0, message: 'Two problems.' };
const allMet = Object.fromEntries(CONSTRAINT_KEYS.map((key) => [key, met])) as Record<
  ConstraintKey,
  ConstraintOutcome
>;
const totals = {
  costCad: 100,
  canopyPercent: 30,
  imperviousPercent: 10,
  waterPercent: 0,
  cut: 0,
  fill: 0,
  net: 0,
  truckTrips: 0,
  disturbedPercent: 0,
  gardenPlots: 0,
} as MetricsTotals;
const { severity } = parametersWith();
const details = { pathSlopes: [] } as const;
const subjects = { paths: 0, closedZones: 0, countRules: 0, trees: 0 } as const;

describe('buildReport', () => {
  it('marks met constraints ok and keeps their severity', () => {
    const report = buildReport({ outcomes: allMet, severity, totals, details, subjects });
    expect(report.constraints.budget).toEqual({
      status: 'ok',
      severity: 'soft',
      value: 0,
      limit: 0,
      message: 'Fine.',
    });
    expect(report.isSubmittable).toBe(true);
    expect(report.totals).toBe(totals);
    expect(report.details).toBe(details);
    expect(report.subjects).toBe(subjects);
  });

  it('warns on a missed soft constraint and still allows submission', () => {
    const report = buildReport({
      outcomes: { ...allMet, budget: missed },
      severity,
      totals,
      details,
      subjects,
    });
    expect(report.constraints.budget.status).toBe('warn');
    expect(isSubmittable(report)).toBe(true);
  });

  it('fails a missed hard constraint and blocks submission', () => {
    const report = buildReport({
      outcomes: { ...allMet, requiredFeatures: missed },
      severity,
      totals,
      details,
      subjects,
    });
    expect(report.constraints.requiredFeatures.status).toBe('fail');
    expect(report.isSubmittable).toBe(false);
    expect(isSubmittable(report)).toBe(false);
    expect(failedConstraints(report)).toEqual(['requiredFeatures']);
  });
});

describe('requireSubmittable', () => {
  it('passes a submittable report through', () => {
    const report = buildReport({ outcomes: allMet, severity, totals, details, subjects });
    expect(requireSubmittable(report)).toEqual({ ok: true, value: report });
  });

  it('returns a constraint violation that names the failed keys', () => {
    const outcomes = { ...allMet, requiredFeatures: missed, forbiddenZones: missed };
    const report = buildReport({ outcomes, severity, totals, details, subjects });
    expect(requireSubmittable(report)).toEqual({
      ok: false,
      error: { kind: 'constraintViolation', failed: ['requiredFeatures', 'forbiddenZones'] },
    });
  });
});
