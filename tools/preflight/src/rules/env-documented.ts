import { compareEnv, ENV_EXAMPLE_FILE, ENV_SCHEMA_FILE } from '../env-keys.js';
import { fileExists, readText } from '../files.js';
import type { Finding, PreflightRule } from '../types.js';

const ID = 'env-documented';

/** Findings for env drift; shared with doctor so both report the same thing. */
export function envFindings(rootDir: string, ruleId: string): Finding[] {
  const missing = [ENV_SCHEMA_FILE, ENV_EXAMPLE_FILE].filter((file) => !fileExists(rootDir, file));
  if (missing.length > 0) {
    return missing.map((file) => ({ ruleId, file, message: 'file is missing' }));
  }
  const drift = compareEnv(readText(rootDir, ENV_SCHEMA_FILE), readText(rootDir, ENV_EXAMPLE_FILE));
  return [
    ...drift.missingFromExample.map((key) => ({
      ruleId,
      file: ENV_EXAMPLE_FILE,
      message: `${key} is in the env schema but not in .env.example`,
    })),
    ...drift.missingFromSchema.map((key) => ({
      ruleId,
      file: ENV_SCHEMA_FILE,
      message: `${key} is in .env.example but not in the env schema`,
    })),
    ...drift.uncommented.map(({ key, line }) => ({
      ruleId,
      file: ENV_EXAMPLE_FILE,
      line,
      message: `${key} has no comment line above it`,
    })),
  ];
}

export const rule: PreflightRule = {
  id: ID,
  doc: 'AGENTS.md#configuration',
  tier: 'quick',
  severity: 'error',
  summary: 'The env schema and .env.example list the same keys, each with a comment above it.',
  fixHint: 'Add the variable to both packages/config/src/env.ts and .env.example, with a comment.',
  check(ctx) {
    return Promise.resolve(envFindings(ctx.rootDir, ID));
  },
};
