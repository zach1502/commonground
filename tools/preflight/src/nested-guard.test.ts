import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { spawnExec } from './exec.js';
import { isAncestorPid, MAX_ANCESTOR_LEVELS, NESTED_ENV, nestedVerdict } from './nested-guard.js';
import { REPO_ROOT } from './testing/fixture-context.js';
import type { Exec } from './types.js';

/** A fake `ps -o ppid= -p <pid>` that answers from a child-to-parent table. */
function fakePs(parents: Record<number, number>): Exec {
  return (_command, args) => {
    const parent = parents[Number(args.at(-1))];
    return Promise.resolve(
      parent === undefined
        ? { code: 1, stdout: '', stderr: 'no such process' }
        : { code: 0, stdout: `  ${String(parent)}\n`, stderr: '' },
    );
  };
}

describe('isAncestorPid', () => {
  it('matches the direct parent without calling ps', async () => {
    expect(await isAncestorPid(10, 10, fakePs({}))).toBe(true);
  });

  it('walks up to five levels of ancestors', async () => {
    const chain = { 20: 30, 30: 40, 40: 50, 50: 60, 60: 70 };
    expect(await isAncestorPid(60, 20, fakePs(chain))).toBe(true);
    expect(MAX_ANCESTOR_LEVELS).toBe(5);
    expect(await isAncestorPid(70, 20, fakePs(chain))).toBe(false);
  });

  it('falls back to the direct parent when ps fails or cannot start', async () => {
    expect(await isAncestorPid(30, 20, fakePs({}))).toBe(false);
    const throwing: Exec = () => Promise.reject(new Error('spawn EPERM'));
    expect(await isAncestorPid(30, 20, throwing)).toBe(false);
    expect(await isAncestorPid(20, 20, throwing)).toBe(true);
  });
});

describe('nestedVerdict', () => {
  it('is none when the variable is unset or empty', async () => {
    expect(await nestedVerdict({}, 20, fakePs({}))).toBe('none');
    expect(await nestedVerdict({ [NESTED_ENV]: '' }, 20, fakePs({}))).toBe('none');
  });

  it('is nested only when the variable names an ancestor', async () => {
    expect(await nestedVerdict({ [NESTED_ENV]: '30' }, 20, fakePs({ 20: 30 }))).toBe('nested');
    expect(await nestedVerdict({ [NESTED_ENV]: '4242' }, 20, fakePs({ 20: 1 }))).toBe('spoofed');
    expect(await nestedVerdict({ [NESTED_ENV]: '1' }, 20, fakePs({}))).toBe('spoofed');
    expect(await nestedVerdict({ [NESTED_ENV]: 'yes' }, 20, fakePs({}))).toBe('spoofed');
  });
});

describe('the preflight CLI under the guard', () => {
  const cli = path.join(REPO_ROOT, 'tools', 'preflight', 'src', 'cli.ts');
  // node --import tsx keeps the CLI a direct child of this test process.
  const run = (pid: string) =>
    spawnExec(process.execPath, ['--import', 'tsx', cli, '--full'], {
      cwd: REPO_ROOT,
      env: { ...process.env, CI: '1', [NESTED_ENV]: pid },
    });

  it('skips a nested spawn from the runner, even in CI', async () => {
    const result = await run(String(process.pid));
    expect(result.stdout.trim()).toBe('preflight: nested run skipped');
    expect(result.code).toBe(0);
  }, 30_000);

  it('refuses in CI when the variable names a process that is not an ancestor', async () => {
    const result = await run('999999999');
    expect(result.stdout.trim()).toBe('skip refused in CI');
    expect(result.code).toBe(2);
  }, 30_000);
});
