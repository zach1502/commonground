import { contentProblems, toFinding, WORD_FINDING_IDS } from '../content.js';
import type { PreflightRule } from '../types.js';

const ID = 'content-patterns';

export const rule: PreflightRule = {
  id: ID,
  doc: 'CONTENT.md#never-used',
  tier: 'quick',
  severity: 'error',
  summary: 'Docs, locale strings and seed text avoid the banned patterns such as dashes and emoji.',
  fixHint: 'Rewrite the text as the message says. Patterns are listed in the Word list section.',
  check(ctx) {
    const findings = contentProblems(ctx)
      .filter(({ finding }) => !WORD_FINDING_IDS.has(finding.id))
      .map((problem) => toFinding(ID, problem));
    return Promise.resolve(findings);
  },
};
