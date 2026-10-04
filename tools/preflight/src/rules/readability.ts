import { lintLocaleReadability } from '@parkshape/textlint-rule-content/locale-strings';
import {
  isDocFile,
  paragraphReadabilityFindings,
} from '@parkshape/textlint-rule-content/readability';

import { toFinding, type ContentProblem } from '../content.js';
import { lineOf } from '../files.js';
import { scopedTexts } from '../scan.js';
import type { PreflightRule } from '../types.js';

const ID = 'readability';
const LOCALE_GLOBS = ['apps/web/src/locales/**/*.json'];
const DOC_GLOBS = ['*.md', 'docs/*.md'];

function localeProblems(file: string, text: string): ContentProblem[] {
  try {
    return lintLocaleReadability(text, file).map(({ pointer, finding }) => ({
      file,
      where: pointer,
      finding,
    }));
  } catch {
    // content-patterns reports invalid JSON; this rule has nothing to measure.
    return [];
  }
}

function docProblems(file: string, text: string): ContentProblem[] {
  return paragraphReadabilityFindings(text).map((finding) => ({
    file,
    line: lineOf(text, finding.index),
    finding,
  }));
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'CONTENT.md#who-we-write-for',
  tier: 'quick',
  severity: 'error',
  summary:
    'Multi-sentence locale strings read at grade 8 or lower, and doc paragraphs at grade 10 or lower.',
  fixHint: 'Split long sentences and use shorter words. The grade is Flesch-Kincaid.',
  check(ctx) {
    const locales = scopedTexts(ctx, LOCALE_GLOBS).flatMap(({ file, text }) =>
      localeProblems(file, text),
    );
    const docs = scopedTexts(ctx, DOC_GLOBS)
      .filter(({ file }) => isDocFile(file))
      .flatMap(({ file, text }) => docProblems(file, text));
    return Promise.resolve([...locales, ...docs].map((problem) => toFinding(ID, problem)));
  },
};
