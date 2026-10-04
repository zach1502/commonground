import { describe, expect, it } from 'vitest';

import { sourcedSchema } from '../../answer-source.js';
import { contentProblems } from '../../filter.js';
import {
  MAX_LABEL_CHARS,
  summaryIssues,
  summarySchema,
  type Summary,
} from '../../schema/summary.js';
import type { SummaryInput } from '../../types.js';
import type { SummaryProvider } from '../summary-provider.js';

import { COMMENTED_SUMMARY_INPUT, EMPTY_SUMMARY_INPUT, SUMMARY_INPUT } from './summary-fixtures.js';

function labelsOf(summary: Summary): string[] {
  return [
    ...summary.themes.map(({ label }) => label),
    ...summary.tradeoffs.flatMap(({ a, b }) => [a, b]),
  ];
}

/** Behaviour every SummaryProvider adapter must have. Each adapter test calls this with a factory. */
export function summaryProviderContract(name: string, makeProvider: () => SummaryProvider): void {
  const summarize = async (input: SummaryInput) => (await makeProvider().summarize(input)).value;

  describe(`${name} meets the SummaryProvider contract`, () => {
    it('says who wrote the summary: the fixed rules, or a model it names', async () => {
      const answer = await makeProvider().summarize(SUMMARY_INPUT);
      expect(sourcedSchema(summarySchema).safeParse(answer).success).toBe(true);
    });

    it('returns a summary that validates against the schema', async () => {
      const summary = await summarize(SUMMARY_INPUT);
      expect(summarySchema.safeParse(summary).success).toBe(true);
    });

    it('counts no more designs than it was given and names real examples', async () => {
      const summary = await summarize(SUMMARY_INPUT);
      expect(summaryIssues(summary, SUMMARY_INPUT.topDesigns)).toEqual([]);
      expect(summary.themes.every(({ designCount }) => designCount >= 1)).toBe(true);
    });

    it('uses no banned words', async () => {
      const summary = await summarize(SUMMARY_INPUT);
      expect(labelsOf(summary).flatMap(contentProblems)).toEqual([]);
    });

    it('states the element comments and the most commented element in one line', async () => {
      const summary = await summarize(COMMENTED_SUMMARY_INPUT);
      expect(summarySchema.safeParse(summary).success).toBe(true);
      expect(summary.commentLine).toBe('6 comments on elements, most on Bench');
      expect(contentProblems(summary.commentLine ?? '')).toEqual([]);
      expect((summary.commentLine ?? '').length).toBeLessThanOrEqual(MAX_LABEL_CHARS);
    });

    it('states no comment line while no element has a comment', async () => {
      expect((await summarize(SUMMARY_INPUT)).commentLine).toBeUndefined();
    });

    it('returns a valid summary when there are no designs yet', async () => {
      const summary = await summarize(EMPTY_SUMMARY_INPUT);
      expect(summarySchema.safeParse(summary).success).toBe(true);
      expect(summaryIssues(summary, [])).toEqual([]);
    });
  });
}
