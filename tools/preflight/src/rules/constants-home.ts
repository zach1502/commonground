import { numberedLines } from '../files.js';
import { scopedTexts } from '../scan.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'constants-home';
// The task allows 0, 1 and 2 bare; -1 is a unary minus on 1.
const ALLOWED_VALUES = new Set(['0', '1', '2']);
const COMMENTS_AND_STRINGS =
  /\/\/[^\n]*|\/\*[\s\S]*?\*\/|'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g;
const NUMBER = /(?<![\w$.])(\d[\d_]*(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![\w$])/g;
const NAMED_CONSTANT = /^\s*(?:export\s+)?const\s+[A-Z][A-Z0-9_]*\s*(?::[^=]+)?=/;
const ARRAY_INDEX = /^\[\s*\d+\s*\]$/;

/** Blanks comments and string literals while keeping every offset and newline. */
export function blankCommentsAndStrings(source: string): string {
  return source.replace(COMMENTS_AND_STRINGS, (match) => match.replace(/[^\n]/g, ' '));
}

function isArrayIndex(lineText: string, start: number, length: number): boolean {
  const before = lineText.slice(0, start).trimEnd();
  const after = lineText.slice(start + length).trimStart();
  return ARRAY_INDEX.test(`${before.slice(-1)}0${after.slice(0, 1)}`);
}

/** Numeric literals that should be named constants, with their line numbers. */
export function magicNumbers(source: string): { line: number; value: string }[] {
  return numberedLines(blankCommentsAndStrings(source))
    .filter(({ text }) => !NAMED_CONSTANT.test(text))
    .flatMap(({ line, text }) =>
      [...text.matchAll(NUMBER)]
        .filter(
          (match) => !ALLOWED_VALUES.has(String(Number((match[1] ?? '').replaceAll('_', '')))),
        )
        .filter((match) => !isArrayIndex(text, match.index, match[0].length))
        .map((match) => ({ line, value: match[0] })),
    );
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#code-smells',
  tier: 'standard',
  severity: 'warn',
  summary:
    'Numbers in packages/core are named constants in constants.ts or next to their one user.',
  fixHint: 'Name the number in packages/core/src/constants.ts and import it.',
  check(ctx) {
    const files = scopedTexts(
      ctx,
      ['packages/core/src/**/*.{ts,tsx}'],
      ['packages/core/src/constants.ts', '**/*.test.{ts,tsx}', '**/*.d.ts', '**/catalog/**'],
    );
    const findings = files.flatMap(({ file, text }) =>
      magicNumbers(text).map(({ line, value }): Finding => ({
        ruleId: ID,
        file,
        line,
        message: `magic number ${value}`,
      })),
    );
    return Promise.resolve(findings);
  },
};
