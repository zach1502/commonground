#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  formatProblem,
  jsonFileArgs,
  lintJsonText,
  lintLocaleReadability,
  scopeForFile,
} from './locale-strings.js';

/**
 * Lints string values in locale and seed JSON with the content rules, and locale strings
 * with the grade 8 readability check.
 * Usage: node tools/textlint-rules/lint-locales.js [--scope=locales|all] [file.json ...]
 * With no files it scans the default roots below. Without --scope, the scope comes from
 * the path (see scopeForFile). Exits 1 on any error.
 */
const DEFAULT_ROOTS = ['apps/web/src/locales', 'packages/db/seed'];

function jsonFilesUnder(root) {
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

const SCOPE_FLAG = '--scope=';
const [, , ...args] = process.argv;
const scopeArg = args.find((arg) => arg.startsWith(SCOPE_FLAG))?.slice(SCOPE_FLAG.length);
const fileArgs = jsonFileArgs(args);
const files = fileArgs.length > 0 ? fileArgs : DEFAULT_ROOTS.flatMap(jsonFilesUnder);
const problems = files.flatMap((file) => {
  const text = readFileSync(file, 'utf8');
  return [
    ...lintJsonText(text, file, scopeArg ?? scopeForFile(file)),
    ...lintLocaleReadability(text, file),
  ];
});

for (const problem of problems) {
  process.stdout.write(`${formatProblem(problem)}\n`);
}

const errorCount = problems.filter(({ finding }) => finding.severity === 'error').length;
process.stdout.write(
  `lint-locales: ${files.length} files, ${problems.length} problems, ${errorCount} errors\n`,
);
process.exitCode = errorCount > 0 ? 1 : 0;
