import path from 'node:path';

import { scopedTexts } from '../scan.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'file-budget';
const CODE_FILE_LIMIT = 300;
const MARKDOWN_LIMIT = 400;
const JSON_LIMIT = 600;
export const LINE_BUDGETS: Readonly<Record<string, number>> = {
  '.css': CODE_FILE_LIMIT,
  '.sql': CODE_FILE_LIMIT,
  '.md': MARKDOWN_LIMIT,
  '.json': JSON_LIMIT,
};
const EXCLUDE = [
  '**/package-lock.json',
  '**/pnpm-lock.yaml',
  '**/fixtures/**',
  '**/generated/**',
  '**/*.generated.*',
  'apps/api/openapi.json',
];

function lineCount(text: string): number {
  const trimmed = text.endsWith('\n') ? text.slice(0, -1) : text;
  return trimmed === '' ? 0 : trimmed.split('\n').length;
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#code-limits',
  tier: 'quick',
  severity: 'error',
  summary: 'CSS and SQL files stay under 300 lines, Markdown under 400 and JSON under 600.',
  fixHint: 'Split the file by concern. Generated files belong under a generated directory.',
  check(ctx) {
    const findings = scopedTexts(ctx, ['**/*.{css,sql,md,json}'], EXCLUDE).flatMap(
      ({ file, text }): Finding[] => {
        const budget = LINE_BUDGETS[path.extname(file)] ?? Number.POSITIVE_INFINITY;
        const lines = lineCount(text);
        return lines > budget
          ? [{ ruleId: ID, file, message: `${String(lines)} lines, budget is ${String(budget)}` }]
          : [];
      },
    );
    return Promise.resolve(findings);
  },
};
