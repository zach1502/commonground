import { lintTermBans } from '@parkshape/textlint-rule-content/term-bans';

import { scopedTexts } from '../scan.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'content-terminology';
const LOCALE_GLOBS = ['apps/web/src/locales/**/*.json'];

function localeFindings(file: string, text: string): Finding[] {
  let found: ReturnType<typeof lintTermBans>;
  try {
    found = lintTermBans(text);
  } catch {
    // content-patterns reports invalid JSON; this rule has nothing to scan.
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
  doc: 'CONTENT.md#terminology',
  tier: 'quick',
  severity: 'error',
  summary:
    'One term names each concept; the rejected synonyms in termBans do not appear in locale files.',
  fixHint:
    'Use the chosen term (Planner, design, rule, item, vote) in place of the rejected synonym.',
  check(ctx) {
    const findings = scopedTexts(ctx, LOCALE_GLOBS).flatMap(({ file, text }) =>
      localeFindings(file, text),
    );
    return Promise.resolve(findings);
  },
};
