import type { RequiredFeature } from '../schema/parameters.js';

import type { CountBreach, FeatureShortfall } from './counts.js';
import { formatCad, formatPercentValue, plural, sentenceStart } from './format.js';
import { problemCountOutcome, type ConstraintOutcome } from './outcome.js';

export function budgetOutcome(totalCad: number, budgetCad: number): ConstraintOutcome {
  const met = totalCad <= budgetCad;
  const cost = formatCad(totalCad);
  const budget = formatCad(budgetCad);
  const message = met
    ? `Design costs ${cost} of the ${budget} budget.`
    : `Design costs ${cost}, which is ${formatCad(totalCad - budgetCad)} over the ${budget} budget. Remove items or choose lower-cost surfaces.`;
  return { met, value: totalCad, limit: budgetCad, message };
}

export function canopyOutcome(percent: number, minPercent: number): ConstraintOutcome {
  const met = percent >= minPercent;
  const share = `Tree canopy covers ${formatPercentValue(percent)} of the park`;
  const message = met
    ? `${share}, meeting the ${formatPercentValue(minPercent)} target.`
    : `${share}. Plant trees to reach ${formatPercentValue(minPercent)}.`;
  return { met, value: percent, limit: minPercent, message };
}

export function imperviousOutcome(percent: number, maxPercent: number): ConstraintOutcome {
  const met = percent <= maxPercent;
  const share = `Hard surfaces cover ${formatPercentValue(percent)} of the park`;
  const message = met
    ? `${share}, within the ${formatPercentValue(maxPercent)} limit.`
    : `${share}. Replace some with planting to reach ${formatPercentValue(maxPercent)} or less.`;
  return { met, value: percent, limit: maxPercent, message };
}

function featureName(feature: RequiredFeature): string {
  return 'category' in feature ? feature.category : feature.catalogId;
}

function shortfallMessage({ feature, count, plots }: FeatureShortfall): string {
  const name = featureName(feature);
  if (count < feature.minCount) {
    return `The design has ${plural(count, `${name} item`)}. Add at least ${String(feature.minCount)}.`;
  }
  return `${sentenceStart(name)} areas fit ${String(plots)} plots. Make them larger to fit ${String(feature.minPlots)}.`;
}

export function featuresOutcome(shortfalls: readonly FeatureShortfall[]): ConstraintOutcome {
  return problemCountOutcome(
    shortfalls.map(shortfallMessage),
    'The design has every required feature.',
  );
}

function breachMessage({ category, count, min, max }: CountBreach): string {
  const has = `The design has ${plural(count, `${category} item`)}.`;
  return max !== undefined && count > max
    ? `${has} The limit is ${String(max)}.`
    : `${has} Add at least ${String(min)}.`;
}

export function countsOutcome(breaches: readonly CountBreach[]): ConstraintOutcome {
  return problemCountOutcome(
    breaches.map(breachMessage),
    'Every category is within its count range.',
  );
}
