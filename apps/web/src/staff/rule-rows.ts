import { messages } from '../messages';

import { moneyText, type ParametersDraft } from './parameters-form';

export interface RuleRow {
  readonly id: 'budget' | 'canopy' | 'impervious' | 'plots' | 'slope';
  readonly term: string;
  readonly value: string;
}

/** The 5 headline rules with their chosen values, for step 4's summary and the Publish review. */
export function ruleRows(draft: ParametersDraft): RuleRow[] {
  const labels = messages.planner.parameters.summaryRows;
  const { numbers } = draft;
  return [
    { id: 'budget', term: labels.budget, value: `$${moneyText(numbers.budgetTotal)}` },
    { id: 'canopy', term: labels.canopy, value: `${numbers.canopyMin}%` },
    { id: 'impervious', term: labels.impervious, value: `${numbers.imperviousMax}%` },
    { id: 'plots', term: labels.plots, value: numbers.gardenMinPlots },
    { id: 'slope', term: labels.slope, value: `${numbers.maxRunningSlope}%` },
  ];
}
