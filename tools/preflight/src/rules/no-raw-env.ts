import { numberedLines } from '../files.js';
import { CODE_GLOBS, scopedTexts } from '../scan.js';
import type { PreflightRule } from '../types.js';

const ID = 'no-raw-env';
const RAW_ENV = /\bprocess\.env\b|\bimport\.meta\.env\b/;
const ALLOWED = ['packages/config/**', 'tools/**', '**/*.config.*'];

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#configuration',
  tier: 'quick',
  severity: 'error',
  summary: 'Only packages/config and tools read `process.env` or `import.meta.env`.',
  fixHint: 'Add the value to the env schema and pass it in from the container.',
  check(ctx) {
    const findings = scopedTexts(ctx, CODE_GLOBS, ALLOWED).flatMap(({ file, text }) =>
      numberedLines(text)
        .filter(({ text: lineText }) => RAW_ENV.test(lineText))
        .map(({ line }) => ({ ruleId: ID, file, line, message: 'reads the environment directly' })),
    );
    return Promise.resolve(findings);
  },
};
