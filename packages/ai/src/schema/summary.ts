import { z } from 'zod';

import { toModelSchema } from './intent.js';

export const MAX_THEMES = 5;
export const MAX_TRADEOFFS = 3;
export const MAX_LABEL_CHARS = 80;
// A tradeoff is stated only when at least this many designs split on it, so the page never
// shows a share of a tiny denominator. Matches the "groups under 5" suppression rule.
export const MIN_TRADEOFF_DESIGNS = 5;

const labelSchema = z.string().min(1).max(MAX_LABEL_CHARS);

export const themeSchema = z.strictObject({
  label: labelSchema,
  designCount: z.int().min(0),
  exampleDesignId: z.string().min(1),
});

export const tradeoffSchema = z.strictObject({
  a: labelSchema,
  b: labelSchema,
  /** Designs that leaned toward `a`, so the page can say "12 of 21 designs". */
  leanA: z.int().min(0),
  /** Designs that leaned either way on this pair: the claim's n. */
  chose: z.int().min(1),
});

/** What the model writes. The comment line comes from counts, so the model never writes it. */
export const modelSummarySchema = z.strictObject({
  themes: z.array(themeSchema).max(MAX_THEMES),
  tradeoffs: z.array(tradeoffSchema).max(MAX_TRADEOFFS),
});

export const summarySchema = modelSummarySchema.extend({
  /** Such as "6 comments on elements, most on Bench"; absent while nobody has commented. */
  commentLine: labelSchema.optional(),
});

export type Theme = z.infer<typeof themeSchema>;
export type Tradeoff = z.infer<typeof tradeoffSchema>;
export type Summary = z.infer<typeof summarySchema>;

export const summaryJsonSchema = toModelSchema('park-summary', modelSummarySchema);

/** Checks a summary against the designs it describes: counts fit and examples exist. */
export function summaryIssues(summary: Summary, topDesigns: readonly { id: string }[]): string[] {
  const ids = new Set(topDesigns.map(({ id }) => id));
  return summary.themes.flatMap((theme) => {
    const issues: string[] = [];
    if (theme.designCount > topDesigns.length) {
      issues.push(
        `${theme.label} counts ${String(theme.designCount)} designs but only ${String(topDesigns.length)} were given`,
      );
    }
    if (!ids.has(theme.exampleDesignId)) {
      issues.push(`${theme.label} names ${theme.exampleDesignId}, which is not a top design`);
    }
    return issues;
  });
}
