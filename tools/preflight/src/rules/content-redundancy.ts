import { lintRedundancy } from '@parkshape/textlint-rule-content/redundancy';

import { scopedTexts } from '../scan.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'content-redundancy';
const LOCALE_GLOBS = ['apps/web/src/locales/**/*.json'];

function localeFindings(file: string, text: string): Finding[] {
  let found: ReturnType<typeof lintRedundancy>;
  try {
    found = lintRedundancy(text);
  } catch {
    // content-patterns reports invalid JSON; this rule has nothing to compare.
    return [];
  }
  return found.map(({ pointer, message }) => ({
    ruleId: ID,
    file,
    message: `${pointer}: ${message}`,
    severity: 'error',
  }));
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'CONTENT.md#do-not-explain-the-obvious',
  tier: 'quick',
  severity: 'error',
  summary:
    'Help text shares at most one content word with its label, and no string narrates a control.',
  fixHint:
    'Delete the helper text, or reword it so it does not repeat the label or narrate a control.',
  check(ctx) {
    const findings = scopedTexts(ctx, LOCALE_GLOBS).flatMap(({ file, text }) =>
      localeFindings(file, text),
    );
    return Promise.resolve(findings);
  },
};
