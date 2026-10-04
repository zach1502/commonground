import {
  checkMarkdownSource,
  checkText,
  maskMarkdown,
  type ContentFinding,
} from '@parkshape/textlint-rule-content/checker';
import { lintJsonText } from '@parkshape/textlint-rule-content/locale-strings';

import { lineOf } from './files.js';
import { scopedTexts } from './scan.js';
import type { Finding, RuleContext } from './types.js';

export interface ContentProblem {
  readonly file: string;
  readonly line?: number;
  readonly where?: string;
  readonly finding: ContentFinding;
}

const MARKDOWN_GLOBS = ['**/*.md', 'packages/db/seed/**/*.{md,txt}'];
const JSON_GLOBS = ['apps/web/src/locales/**/*.json', 'packages/db/seed/**/*.json'];
// Inline code, HTML comments, link targets and autolinks are not prose.
const NON_PROSE = /`[^`\n]*`|<!--[\s\S]*?-->|\]\([^)\n]*\)|<https?:[^>\n]*>|https?:\/\/\S+/g;

function blank(text: string): string {
  return text.replace(/[^\n]/g, ' ');
}

/** Markdown source with code, comments and URLs blanked so only prose is checked. */
export function proseOf(source: string): string {
  return maskMarkdown(source).replace(NON_PROSE, blank);
}

function markdownProblems(file: string, source: string): ContentProblem[] {
  const prose = proseOf(source);
  const findings = [...checkText(prose, { scope: 'markdown' }), ...checkMarkdownSource(source)];
  return findings.map((finding) => ({ file, line: lineOf(source, finding.index), finding }));
}

function jsonProblems(file: string, source: string): ContentProblem[] {
  try {
    return lintJsonText(source, file).map(({ pointer, finding }) => ({
      file,
      where: pointer,
      finding,
    }));
  } catch {
    const finding = { id: 'invalid-json', index: 0, length: 0, severity: 'error' as const };
    return [{ file, finding: { ...finding, message: 'The file is not valid JSON.' } }];
  }
}

/** Every content-rule problem in the Markdown, locale and seed files in scope. */
export function contentProblems(ctx: RuleContext): ContentProblem[] {
  return [
    ...scopedTexts(ctx, MARKDOWN_GLOBS).flatMap(({ file, text }) => markdownProblems(file, text)),
    ...scopedTexts(ctx, JSON_GLOBS).flatMap(({ file, text }) => jsonProblems(file, text)),
  ];
}

export const WORD_FINDING_IDS = new Set(['banned-word', 'review-word', 'hedge']);

/** Turns a content problem into a finding; checker warnings become warn findings. */
export function toFinding(ruleId: string, problem: ContentProblem): Finding {
  const where = problem.where === undefined ? '' : `${problem.where}: `;
  return {
    ruleId,
    file: problem.file,
    ...(problem.line === undefined ? {} : { line: problem.line }),
    message: `${where}${problem.finding.message}`,
    severity: problem.finding.severity === 'error' ? 'error' : 'warn',
  };
}
