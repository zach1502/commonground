import { numberedLines, packageOf } from '../files.js';
import { COMMENT_OPENER, scopedTexts } from '../scan.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'disable-audit';
export const DISABLE_CAP_PER_PACKAGE = 5;
export const DISABLE_GLOBS = ['**/*.{ts,tsx,js,mjs,cjs,css,md}'];
const DIRECTIVE = new RegExp(
  `${COMMENT_OPENER}\\s*(eslint-disable(?:-next-line|-line)?|stylelint-disable(?:-next-line|-line)?|textlint-disable|@ts-expect-error|@ts-ignore)\\b`,
);
const REASON_WITH_ISSUE = /\s--\s.*#\d+/;
// ESLint directives also name the rules they turn off, before the reason.
// `<rule>` is the placeholder the docs quote.
const RULE_NAME = String.raw`(?:[@\w/.-]+|<rule>)`;
const RULE_NAMES_THEN_REASON = new RegExp(
  String.raw`^\s+${RULE_NAME}(?:\s*,\s*${RULE_NAME})*\s+--\s.*#\d+`,
);

function isJustified(directive: string, rest: string): boolean {
  return directive.startsWith('eslint-')
    ? RULE_NAMES_THEN_REASON.test(rest)
    : REASON_WITH_ISSUE.test(rest);
}

function missingText(directive: string): string {
  return directive.startsWith('eslint-')
    ? `${directive} needs a rule name and "-- reason (#issue)" on the same line`
    : `${directive} needs "-- reason (#issue)" on the same line`;
}

export interface Directive {
  readonly file: string;
  readonly line: number;
  readonly directive: string;
  readonly justified: boolean;
}

/**
 * Every suppression comment in the text, with whether it carries a reason and an issue,
 * and for ESLint directives the rule names as well.
 */
export function directivesIn(file: string, text: string): Directive[] {
  return numberedLines(text).flatMap(({ line, text: lineText }) => {
    const match = DIRECTIVE.exec(lineText);
    if (match === null) {
      return [];
    }
    const rest = lineText.slice(match.index + match[0].length);
    const directive = match[1] ?? '';
    return [{ file, line, directive, justified: isJustified(directive, rest) }];
  });
}

/** Suppression count per workspace package. Docs that quote a directive do not count. */
export function countByPackage(directives: readonly Directive[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const { file } of directives.filter((directive) => !directive.file.endsWith('.md'))) {
    const pkg = packageOf(file);
    counts.set(pkg, (counts.get(pkg) ?? 0) + 1);
  }
  return counts;
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#code-limits',
  tier: 'quick',
  severity: 'error',
  summary:
    'Each disable comment names the rule, gives a reason after -- and an issue link; at most 5 per package.',
  fixHint:
    'Fix the code, or write `<rule> -- reason (#12)` on the same line and stay under the cap.',
  check(ctx) {
    const directives = scopedTexts(ctx, DISABLE_GLOBS).flatMap(({ file, text }) =>
      directivesIn(file, text),
    );
    const unjustified = directives
      .filter(({ justified }) => !justified)
      .map(({ file, line, directive }): Finding => ({
        ruleId: ID,
        file,
        line,
        message: missingText(directive),
      }));
    const overCap = [...countByPackage(directives).entries()]
      .filter(([, count]) => count > DISABLE_CAP_PER_PACKAGE)
      .map(([pkg, count]) => ({
        ruleId: ID,
        file: pkg,
        message: `${String(count)} disable comments, cap is ${String(DISABLE_CAP_PER_PACKAGE)}`,
      }));
    return Promise.resolve([...unjustified, ...overCap]);
  },
};
