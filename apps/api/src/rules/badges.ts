import { CONSTRAINT_KEYS, type ConstraintKey } from '@parkshape/core';

/** The part of a constraint result the submit surface needs, from the parsed metrics report. */
export interface ConstraintReadout {
  readonly status: 'ok' | 'warn' | 'fail';
  readonly value: number;
  readonly limit?: number;
  readonly message: string;
}

export type ConstraintReadouts = Readonly<Record<ConstraintKey, ConstraintReadout>>;

/** A hard constraint the design breaks; blocks the submit. */
export interface HardFailure {
  readonly key: ConstraintKey;
  readonly message: string;
}

/** A soft constraint the design misses; shown as a badge, never blocking. */
export interface SoftWarning {
  readonly key: ConstraintKey;
  readonly message: string;
  readonly badge: string;
}

const PERCENT = 100;

function percentGap(value: number, limit: number): number {
  return limit === 0 ? 0 : Math.round((Math.abs(value - limit) / limit) * PERCENT);
}

function count(value: number, noun: string): string {
  const n = Math.round(value);
  return `${String(n)} ${noun}${n === 1 ? '' : 's'}`;
}

type BadgeBuilder = (result: ConstraintReadout) => string;

const RATIO_BADGE: Partial<Record<ConstraintKey, (gap: number) => string>> = {
  budget: (gap) => `Over budget ${String(gap)}%`,
  canopy: (gap) => `Canopy ${String(gap)}% short`,
  impervious: (gap) => `Hard surface ${String(gap)}% over`,
};

const COUNT_NOUN: Partial<Record<ConstraintKey, string>> = {
  requiredFeatures: 'feature short',
  forbiddenZones: 'closed-zone hit',
  slopes: 'steep spot',
  counts: 'count issue',
  terraform: 'grading issue',
  treeProtection: 'root-zone hit',
};

const BADGE: Record<ConstraintKey, BadgeBuilder> = Object.fromEntries(
  CONSTRAINT_KEYS.map((key): [ConstraintKey, BadgeBuilder] => {
    const ratio = RATIO_BADGE[key];
    if (ratio !== undefined) {
      return [key, (result) => ratio(percentGap(result.value, result.limit ?? 0))];
    }
    const noun = COUNT_NOUN[key] ?? 'issue';
    return [key, (result) => count(result.value, noun)];
  }),
) as Record<ConstraintKey, BadgeBuilder>;

/** A short badge for one missed soft constraint, computed from its value and limit. */
function badgeFor(key: ConstraintKey, result: ConstraintReadout): string {
  return BADGE[key](result);
}

/** Hard constraints the design breaks, in constraint order, with the report's message. */
export function hardFailuresFrom(constraints: ConstraintReadouts): HardFailure[] {
  return CONSTRAINT_KEYS.filter((key) => constraints[key].status === 'fail').map((key) => ({
    key,
    message: constraints[key].message,
  }));
}

/** Soft constraints the design misses, in constraint order, with a short badge each. */
export function softWarningsFrom(constraints: ConstraintReadouts): SoftWarning[] {
  return CONSTRAINT_KEYS.filter((key) => constraints[key].status === 'warn').map((key) => ({
    key,
    message: constraints[key].message,
    badge: badgeFor(key, constraints[key]),
  }));
}
