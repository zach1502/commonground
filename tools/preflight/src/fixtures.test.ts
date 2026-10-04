import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { resolveBin } from './bin.js';
import { spawnExec } from './exec.js';
import { PACKAGE_DIR, REPO_ROOT } from './testing/fixture-context.js';

// Each lint tool gets a fail fixture that must keep failing and a pass fixture that must
// keep passing, so a weaker config shows up here instead of going unnoticed.
const FIXTURES = path.join(PACKAGE_DIR, 'fixtures');
const LINT_TIMEOUT_MS = 60_000;

const EXPECTED_ESLINT_RULE: Readonly<Record<string, string>> = {
  'boolean-flag.ts': 'parkshape/no-boolean-flag-params',
  'magic-number.ts': '@typescript-eslint/no-magic-numbers',
  'oversized.ts': 'max-lines',
  'raw-env.ts': 'no-restricted-syntax',
  'vendor-import.ts': 'no-restricted-imports',
  'literal-text.tsx': 'parkshape/no-literal-jsx-text',
};

/** The TypeScript and TSX fixtures directly inside `dir`. */
function typescriptIn(dir: string): string[] {
  return [...filesIn(dir, '.ts'), ...filesIn(dir, '.tsx')];
}

interface EslintFileResult {
  readonly filePath: string;
  readonly errorCount: number;
  readonly messages: readonly { ruleId: string | null }[];
}

interface StylelintResult {
  readonly errored?: boolean;
  readonly warnings: readonly { line: number; rule: string; severity: string }[];
}

function bin(name: string): string {
  const found = resolveBin(REPO_ROOT, name);
  if (found === undefined) {
    throw new Error(`${name} is not installed`);
  }
  return found;
}

function filesIn(dir: string, extension: string): string[] {
  return readdirSync(path.join(FIXTURES, dir), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => path.join(FIXTURES, dir, entry.name));
}

async function eslint(files: readonly string[]): Promise<EslintFileResult[]> {
  // --no-ignore lints the fixtures even though eslint.config.js ignores them for the repo run.
  const args = ['--no-ignore', '--format', 'json', ...files];
  const result = await spawnExec(bin('eslint'), args, { cwd: REPO_ROOT });
  return JSON.parse(result.stdout) as EslintFileResult[];
}

async function stylelint(file: string): Promise<{ code: number; result: StylelintResult }> {
  // Through stdin with no file name, so the config's ignoreFiles does not skip the fixture.
  const args = ['--stdin', '--formatter', 'json'];
  const input = readFileSync(file, 'utf8');
  const run = await spawnExec(bin('stylelint'), args, { cwd: REPO_ROOT, input });
  const output = run.stdout.trim() === '' ? run.stderr : run.stdout;
  const [result] = JSON.parse(output) as StylelintResult[];
  return { code: run.code, result: result ?? { warnings: [] } };
}

async function textlint(file: string): Promise<number> {
  // An empty ignore file, so .textlintignore does not skip the fixture.
  const args = ['--ignore-path', '/dev/null', file];
  return (await spawnExec(bin('textlint'), args, { cwd: REPO_ROOT })).code;
}

describe('lint fixtures', () => {
  it(
    'ESLint fails each TypeScript fail fixture with its rule',
    async () => {
      const results = await eslint(typescriptIn('ts'));
      const rules = Object.fromEntries(
        results.map(({ filePath, errorCount, messages }) => [
          path.basename(filePath),
          errorCount > 0 ? messages.map(({ ruleId }) => ruleId) : [],
        ]),
      );
      for (const [file, rule] of Object.entries(EXPECTED_ESLINT_RULE)) {
        expect(rules[file], file).toContain(rule);
      }
    },
    LINT_TIMEOUT_MS,
  );

  it(
    'ESLint passes the TypeScript pass fixture',
    async () => {
      const results = await eslint(typescriptIn(path.join('ts', 'pass')));
      expect(results.length).toBeGreaterThan(0);
      expect(results.map(({ messages }) => messages)).toEqual(results.map(() => []));
    },
    LINT_TIMEOUT_MS,
  );
});

describe('style and content lint fixtures', () => {
  it(
    'Stylelint fails the raw colour fixture, fill included',
    async () => {
      const file = path.join(FIXTURES, 'css', 'raw-hex.css');
      const { code, result } = await stylelint(file);
      expect(code).not.toBe(0);
      const fillLine =
        readFileSync(file, 'utf8')
          .split('\n')
          .findIndex((line) => line.includes('fill:')) + 1;
      expect(fillLine).toBeGreaterThan(0);
      expect(result.warnings.map(({ line }) => line)).toContain(fillLine);
    },
    LINT_TIMEOUT_MS,
  );

  it(
    'Stylelint passes the CSS pass fixture',
    async () => {
      for (const file of filesIn(path.join('css', 'pass'), '.css')) {
        const { code, result } = await stylelint(file);
        expect(result.warnings, file).toEqual([]);
        expect(code, file).toBe(0);
      }
    },
    LINT_TIMEOUT_MS,
  );

  it(
    'textlint fails the banned words fixture and passes the plain one',
    async () => {
      expect(await textlint(path.join(FIXTURES, 'content', 'banned.md'))).not.toBe(0);
      const passing = filesIn(path.join('content', 'pass'), '.md');
      expect(passing.length).toBeGreaterThan(0);
      for (const file of passing) {
        expect(await textlint(file), file).toBe(0);
      }
    },
    LINT_TIMEOUT_MS,
  );
});
