import { contentProblems, toFinding, WORD_FINDING_IDS } from '../content.js';
import type { PreflightRule } from '../types.js';

const ID = 'content-wordlist';

export const rule: PreflightRule = {
  id: ID,
  doc: 'CONTENT.md#never-used',
  tier: 'quick',
  severity: 'error',
  summary:
    'Docs, locale strings and seed text avoid the banned words; review words and hedges warn.',
  fixHint: 'Rewrite the sentence in plain words. The word list is in the Word list section.',
  check(ctx) {
    const findings = contentProblems(ctx)
      .filter(({ finding }) => WORD_FINDING_IDS.has(finding.id))
      .map((problem) => toFinding(ID, problem));
    return Promise.resolve(findings);
  },
};
