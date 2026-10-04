import { describe, expect, it } from 'vitest';

import { affectedFilters, runTestQuick, TEST_QUICK_ARGS } from './test-quick.js';
import type { Exec, ExecResult } from './types.js';

const OK: ExecResult = { code: 0, stdout: '', stderr: '' };

describe('affectedFilters', () => {
  it('selects each changed package with the packages that depend on it', () => {
    expect(
      affectedFilters([
        'packages/core/src/ids.ts',
        'packages/core/src/ids.test.ts',
        'apps/web/src/main.tsx',
      ]),
    ).toEqual(['--filter=...{./packages/core}', '--filter=...{./apps/web}']);
  });

  it('selects every package when a file that every test run reads changes', () => {
    expect(affectedFilters(['docs/WHY.md', 'vitest.shared.config.ts'])).toBe('all');
    expect(affectedFilters(['pnpm-lock.yaml'])).toBe('all');
  });

  it('selects nothing for changes outside the packages, such as docs', () => {
    expect(affectedFilters(['README.md', 'docs/WHY.md', 'e2e/resident.spec.ts'])).toEqual([]);
  });
});

/** An exec that answers git as if the given files were new and untracked. */
function gitWith(changed: readonly string[]): Exec {
  return (_command, args) =>
    Promise.resolve({ ...OK, stdout: args.includes('--others') ? changed.join('\n') : '' });
}

/** A command runner that records each command and exits with the given code. */
function recorder(calls: string[][], code = 0) {
  return (command: string, args: readonly string[]) => {
    calls.push([command, ...args]);
    return Promise.resolve(code);
  };
}

describe('runTestQuick', () => {
  it('runs the affected packages through turbo with coverage off', async () => {
    const calls: string[][] = [];
    const lines: string[] = [];
    const code = await runTestQuick({
      rootDir: '/repo',
      exec: gitWith(['packages/ai/src/filter.ts']),
      run: recorder(calls),
      write: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(calls).toEqual([
      ['turbo', 'run', 'test', '--filter=...{./packages/ai}', ...TEST_QUICK_ARGS],
    ]);
    expect(lines.join('\n')).toContain('...{./packages/ai}');
  });

  it('runs every package when a shared config changed', async () => {
    const calls: string[][] = [];
    await runTestQuick({
      rootDir: '/repo',
      exec: gitWith(['turbo.json']),
      run: recorder(calls),
      write: () => undefined,
    });
    expect(calls).toEqual([['turbo', 'run', 'test', ...TEST_QUICK_ARGS]]);
  });

  it('runs nothing and says so when no package changed', async () => {
    const calls: string[][] = [];
    const lines: string[] = [];
    const code = await runTestQuick({
      rootDir: '/repo',
      exec: gitWith(['README.md']),
      run: recorder(calls),
      write: (line) => lines.push(line),
    });
    expect(code).toBe(0);
    expect(calls).toEqual([]);
    expect(lines).toEqual(['test:quick: no package changed, so no tests ran']);
  });

  it('passes the turbo exit code back', async () => {
    const run = recorder([], 1);
    const io = { rootDir: '/repo', exec: gitWith(['turbo.json']), run, write: () => undefined };
    expect(await runTestQuick(io)).toBe(1);
  });

  it('keeps coverage off and shows only the output of tests that ran', () => {
    expect(TEST_QUICK_ARGS).toEqual(['--output-logs=new-only', '--', '--coverage.enabled=false']);
  });
});
