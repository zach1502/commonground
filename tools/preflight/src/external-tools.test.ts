import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  missingToolNotices,
  outputTail,
  runStep,
  TOOL_STEPS,
  type ToolStep,
} from './external-tools.js';
import { NESTED_ENV } from './nested-guard.js';
import { fakeExec, fixtureContext, REPO_ROOT } from './testing/fixture-context.js';
import type { Exec, RuleContext, Tier } from './types.js';

function step(id: string): ToolStep {
  const found = TOOL_STEPS.find((candidate) => candidate.id === `tool:${id}`);
  if (found === undefined) {
    throw new Error(`no step ${id}`);
  }
  return found;
}

function repoContext(
  tier: Tier,
  files: readonly string[],
  exec: Exec = fakeExec({ code: 0 }),
): RuleContext {
  return { ...fixtureContext('file-budget', 'pass', { tier, exec }), rootDir: REPO_ROOT, files };
}

describe('external tools', () => {
  it('runs prettier on the changed files in the quick tier', () => {
    const command = step('prettier').command(repoContext('quick', ['a.md', 'b.png']));
    expect(command).toEqual(
      expect.objectContaining({
        args: [
          '--check',
          '--ignore-unknown',
          '--cache',
          '--cache-location',
          'node_modules/.cache/prettier/.prettier-cache',
          'a.md',
        ],
      }),
    );
  });
});

describe('external tool caches', () => {
  it('keeps a stylelint cache, which stylelint drops when its config changes', () => {
    expect(step('stylelint').command(repoContext('full', []))).toEqual(
      expect.objectContaining({
        args: [
          '--allow-empty-input',
          '--cache',
          '--cache-location',
          'node_modules/.cache/stylelint/',
          '**/*.css',
        ],
      }),
    );
  });

  it('skips a file tool in the quick tier when no file matches', () => {
    expect(step('stylelint').command(repoContext('quick', ['a.md']))).toBeUndefined();
  });

  it('runs repo-wide above the quick tier, with the eslint cache below the full tier', () => {
    expect(step('eslint').command(repoContext('standard', []))).toEqual(
      expect.objectContaining({
        args: [
          '--max-warnings',
          '0',
          '--no-warn-ignored',
          '--cache',
          '--cache-strategy',
          'content',
          '--cache-location',
          'node_modules/.cache/eslint/',
          '.',
        ],
      }),
    );
  });

  // A cached result for an unchanged file can miss a typed-rule error that a change to another
  // file's types causes, so the push and CI tier lints every file afresh.
  it('runs eslint without its cache in the full tier', () => {
    expect(step('eslint').command(repoContext('full', []))).toEqual(
      expect.objectContaining({ args: ['--max-warnings', '0', '--no-warn-ignored', '.'] }),
    );
  });

  it('gives eslint a larger heap, since typed linting of the whole repo passes 4 GB', () => {
    const command = step('eslint').command(repoContext('standard', []));
    expect(command).toEqual(
      expect.objectContaining({ env: { NODE_OPTIONS: '--max-old-space-size=6144' } }),
    );
  });
});

describe('external tool commands', () => {
  it('runs gitleaks on the staged change in the quick tier', () => {
    expect(step('gitleaks').command(repoContext('quick', []))).toEqual({
      bin: 'gitleaks',
      args: ['protect', '--staged', '--no-banner', '--redact', '--verbose'],
    });
  });

  // Without --verbose gitleaks prints only "leaks found: 1", so the report cannot name the file.
  it('scans the history with each finding named by file and line, secret redacted', () => {
    expect(step('gitleaks').command(repoContext('full', []))).toEqual({
      bin: 'gitleaks',
      args: ['detect', '--no-banner', '--redact', '--verbose'],
    });
  });
});

describe('external tools that are missing', () => {
  it('reports a tool that is not installed as info', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-tools-'));
    const ctx = { ...fixtureContext('file-budget', 'pass', { tier: 'standard' }), rootDir };
    expect(await runStep(step('knip'), ctx)).toEqual([
      { ruleId: 'tool:knip', severity: 'info', message: 'not installed; skipped' },
    ]);
    const missing = fakeExec({ missing: true, code: 127 });
    expect(await runStep(step('gitleaks'), { ...ctx, exec: missing })).toEqual([
      expect.objectContaining({ severity: 'info' }),
    ]);
  });

  it('reports a missing tool as an error in CI', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-tools-'));
    const missing = fakeExec({ missing: true, code: 127 });
    const ctx = {
      ...fixtureContext('file-budget', 'pass', { tier: 'standard', env: { CI: '1' } }),
      rootDir,
      exec: missing,
    };
    expect(await runStep(step('gitleaks'), ctx)).toEqual([
      { ruleId: 'tool:gitleaks', severity: 'error', message: 'not installed; CI needs it' },
    ]);
    expect(await runStep(step('knip'), ctx)).toEqual([
      expect.objectContaining({ severity: 'error' }),
    ]);
  });

  it('turns skipped tools into REMINDERS lines', () => {
    const skipped = { severity: 'info' as const, message: 'not installed; skipped' };
    expect(
      missingToolNotices([
        { ruleId: 'tool:gitleaks', ...skipped },
        { ruleId: 'tool:knip', ...skipped },
        { ruleId: 'tool:tsc', message: 'bad' },
      ]),
    ).toEqual([
      'gitleaks is not installed; secret scan skipped',
      'knip is not installed; its check was skipped',
    ]);
  });
});

describe('external tool runs', () => {
  it('marks child runs as nested and reports failures with the output tail', async () => {
    const seen: Record<string, string | undefined>[] = [];
    const exec: Exec = (_command, _args, options) => {
      seen.push({ ...options?.env });
      return Promise.resolve({ code: 1, stdout: 'bad\n', stderr: '' });
    };
    const findings = await runStep(step('tsc'), repoContext('standard', [], exec));
    expect(seen[0]?.[NESTED_ENV]).toBe(String(process.pid));
    expect(findings).toEqual([{ ruleId: 'tool:tsc', message: 'bad' }]);
  });

  it('skips commitlint when there is no message and no merge base', () => {
    const ctx = fixtureContext('file-budget', 'pass', { tier: 'full' });
    expect(step('commitlint').command(ctx)).toBeUndefined();
  });

  it('runs commitlint on the message being written or over the pushed range only', () => {
    const commitlint = step('commitlint');
    const leftover = repoContext('standard', []);
    expect(commitlint.command(leftover)).toBeUndefined();
    expect(commitlint.command({ ...leftover, commitMessageFile: '/tmp/msg' })).toEqual(
      expect.objectContaining({ args: ['--edit', '/tmp/msg'] }),
    );
    expect(commitlint.command({ ...repoContext('full', []), mergeBase: 'b1' })).toEqual(
      expect.objectContaining({ args: ['--from', 'b1', '--to', 'HEAD'] }),
    );
    expect(commitlint.command(repoContext('full', []))).toBeUndefined();
  });

  it('strips colour codes from tool output', () => {
    const escape = String.fromCharCode(27);
    expect(outputTail({ code: 1, stdout: `${escape}[31mred${escape}[0m`, stderr: '' })).toBe('red');
  });
});
