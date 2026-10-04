import { constraintViolation, type ConstraintViolation } from '../errors.js';
import { err, ok, type Result } from '../result.js';
import type { Severity } from '../schema/catalog.js';
import { CONSTRAINT_KEYS, type ConstraintKey } from '../schema/parameters.js';
import type { Cad, CubicMetres, Percent } from '../schema/units.js';

import type { ConstraintOutcome } from './outcome.js';
import type { PathSlopes } from './slopes.js';

export type ConstraintStatus = 'ok' | 'warn' | 'fail';

export interface ConstraintResult {
  readonly status: ConstraintStatus;
  readonly severity: Severity;
  readonly value: number;
  readonly limit?: number;
  readonly message: string;
}

export interface MetricsTotals {
  readonly costCad: Cad;
  readonly canopyPercent: Percent;
  readonly imperviousPercent: Percent;
  readonly waterPercent: Percent;
  readonly cut: CubicMetres;
  readonly fill: CubicMetres;
  /** Fill minus cut, in cubic metres; negative when soil leaves the site. */
  readonly net: number;
  readonly truckTrips: number;
  readonly disturbedPercent: Percent;
  /**
   * Plots across every garden area, locked or new: the site record's count for an existing
   * garden kept as the baseline has it, otherwise the raised beds that fit.
   */
  readonly gardenPlots: number;
}

export interface MetricsDetails {
  /** Per-path slope samples, so the scene can highlight the segments over the limit. */
  readonly pathSlopes: readonly PathSlopes[];
}

/** How many things each gated meter can judge, so a meter with no subject stays hidden. */
export interface MeterSubjects {
  readonly paths: number;
  readonly closedZones: number;
  readonly countRules: number;
  readonly trees: number;
}

export interface MetricsReport {
  readonly constraints: Readonly<Record<ConstraintKey, ConstraintResult>>;
  readonly totals: MetricsTotals;
  /** Geometry-level results the overlays read, keyed to the same document. */
  readonly details: MetricsDetails;
  /** How many subjects each gated meter has, so a meter with nothing to judge can hide. */
  readonly subjects: MeterSubjects;
  /** False when any hard constraint fails. */
  readonly isSubmittable: boolean;
}

export interface ReportParts {
  readonly outcomes: Readonly<Record<ConstraintKey, ConstraintOutcome>>;
  readonly severity: Readonly<Record<ConstraintKey, Severity>>;
  readonly totals: MetricsTotals;
  readonly details: MetricsDetails;
  readonly subjects: MeterSubjects;
}

function statusOf(outcome: ConstraintOutcome, severity: Severity): ConstraintStatus {
  if (outcome.met) return 'ok';
  return severity === 'hard' ? 'fail' : 'warn';
}

function resultOf(outcome: ConstraintOutcome, severity: Severity): ConstraintResult {
  const { value, limit, message } = outcome;
  return { status: statusOf(outcome, severity), severity, value, limit, message };
}

export function buildReport(parts: ReportParts): MetricsReport {
  const constraints = Object.fromEntries(
    CONSTRAINT_KEYS.map((key) => [key, resultOf(parts.outcomes[key], parts.severity[key])]),
  ) as Record<ConstraintKey, ConstraintResult>;
  const failed = CONSTRAINT_KEYS.some((key) => constraints[key].status === 'fail');
  return {
    constraints,
    totals: parts.totals,
    details: parts.details,
    subjects: parts.subjects,
    isSubmittable: !failed,
  };
}

/** Keys of the constraints with status fail, in CONSTRAINT_KEYS order. */
export function failedConstraints(report: MetricsReport): ConstraintKey[] {
  return CONSTRAINT_KEYS.filter((key) => report.constraints[key].status === 'fail');
}

export function isSubmittable(report: MetricsReport): boolean {
  return failedConstraints(report).length === 0;
}

/** For the submit endpoint: the report when it passes, or the hard constraints that fail. */
export function requireSubmittable(
  report: MetricsReport,
): Result<MetricsReport, ConstraintViolation> {
  const failed = failedConstraints(report);
  return failed.length === 0 ? ok(report) : err(constraintViolation(failed));
}
