import type { Intent, IntentFeature, MetricsReport } from '@parkshape/core';

/** The soft targets a seeded design is tuned toward, so few designs carry a badge. */
const TUNED_TARGETS = ['budget', 'canopy'] as const;

const SMALLER = { large: 'medium', medium: 'small', small: 'small' } as const;

/** How many of the tuned targets the report misses. */
export function missedTargets(report: MetricsReport): number {
  return TUNED_TARGETS.filter((key) => report.constraints[key].status !== 'ok').length;
}

function shrink(feature: IntentFeature): IntentFeature {
  return feature.size === undefined ? feature : { ...feature, size: SMALLER[feature.size] };
}

/** Plants to the canopy goal when the layout came up short of it. */
function plantToGoal(intent: Intent, report: MetricsReport): Intent | undefined {
  if (report.constraints.canopy.status === 'ok' || intent.canopy === 'maximize') return undefined;
  return { ...intent, canopy: 'maximize' };
}

/** Cheaper choices, one step at a time, while the layout costs more than the budget. */
function trimCost(intent: Intent, report: MetricsReport): Intent | undefined {
  if (report.constraints.budget.status === 'ok') return undefined;
  if (intent.paths.surface !== undefined) {
    return { ...intent, paths: { style: intent.paths.style } };
  }
  if (intent.features.some((feature) => feature.size !== undefined && feature.size !== 'small')) {
    return { ...intent, features: intent.features.map(shrink) };
  }
  if (intent.paths.style !== 'minimal') return { ...intent, paths: { style: 'minimal' } };
  return undefined;
}

/**
 * The next intent to try for a seeded design that misses the budget or canopy target: budget
 * first, since planting more trees costs money, then canopy. Undefined when nothing is left to
 * change. A resident would make the same edits: a cheaper path, smaller areas, more trees.
 */
export function nextIntent(intent: Intent, report: MetricsReport): Intent | undefined {
  return trimCost(intent, report) ?? plantToGoal(intent, report);
}
