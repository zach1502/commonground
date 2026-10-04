import { formatCad, formatPercentValue, type Category } from '@parkshape/core';

import { format, messages } from '../messages';
import { pluralise } from '../plural';

/**
 * The report totals a fact line reads; null while a design has no metrics. Garden plots are left
 * out: the report fits raised beds into the garden outline (105 for the existing garden), while the
 * city records 56 plots there, and the design page and insights count gardens, not plots.
 */
export interface FactTotals {
  readonly canopyPercent: number;
  readonly costCad: number;
}

export interface CategoryCount {
  readonly category: Category;
  readonly count: number;
}

// "a, b and c", with no comma before and, as CONTENT.md writes lists.
const LIST_FORMAT = new Intl.ListFormat('en-CA', { style: 'long', type: 'conjunction' });

/** "Tree canopy 18%, cost $310,000" for a gallery card. Votes are left out. */
export function factLine(totals: FactTotals | null): string | null {
  if (totals === null) return null;
  return format(messages.gallery.facts, {
    canopy: formatPercentValue(Math.round(totals.canopyPercent)),
    cost: formatCad(totals.costCad),
  });
}

/** "42 trees, 4 seats and 1 washroom." for the design page, or null for an empty design. */
export function contentsSentence(rows: readonly CategoryCount[]): string | null {
  if (rows.length === 0) return null;
  const parts = rows.map((row) => pluralise(row.count, messages.designLegend[row.category]));
  return `${LIST_FORMAT.format(parts)}.`;
}

/** "The design costs $310,000.", or null with no metrics. */
export function costSentence(totals: Pick<FactTotals, 'costCad'> | null): string | null {
  if (totals === null) return null;
  return format(messages.designPage.costLine, { cost: formatCad(totals.costCad) });
}
