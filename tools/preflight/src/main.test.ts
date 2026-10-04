import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  EXIT_FAILED,
  EXIT_OK,
  EXIT_USAGE,
  main,
  NESTED_MESSAGE,
  pickTier,
  SKIP_REFUSED_MESSAGE,
  type MainIo,
} from './main.js';
import { NESTED_ENV } from './nested-guard.js';
import { fakeExec, fixtureDir, REPO_ROOT } from './testing/fixture-context.js';
import { createScratchRepo, SCRATCH_TIMEOUT_MS } from './testing/scratch-repo.js';
import type { Exec } from './types.js';

const PARENT_PID = 4100;
// Reads every file in the real repo, which takes tens of seconds when turbo tests all packages at once.
const REPO_SCAN_TIMEOUT_MS = 60_000;

function io(
  env: MainIo['env'] = {},
  rootDir = REPO_ROOT,
  exec: Exec = fakeExec(),
): MainIo & { lines: string[] } {
  const lines: string[] = [];
  return {
    rootDir,
    env,
    exec,
    ppid: PARENT_PID,
    write: (line) => lines.push(line),
    nodeVersion: 'v20.18.1',
    nowMs: 0,
    lines,
  };
}

describe('main', () => {
  it('picks the highest tier and defaults to standard', () => {
    expect(pickTier({})).toBe('standard');
    expect(pickTier({ quick: true })).toBe('quick');
    expect(pickTier({ quick: true, full: true })).toBe('full');
    expect(pickTier({ quick: true, standard: true })).toBe('standard');
  });

  it('skips nested runs whose parent is the named preflight', async () => {
    const out = io({ [NESTED_ENV]: String(PARENT_PID), CI: 'true' });
    expect(await main(['--full'], out)).toBe(EXIT_OK);
    expect(out.lines).toEqual([NESTED_MESSAGE]);
  });

  it('treats a nested variable that names no ancestor like --skip-preflight', async () => {
    const ci = io({ [NESTED_ENV]: '4242', CI: '1' });
    expect(await main(['--full'], ci)).toBe(EXIT_USAGE);
    expect(ci.lines).toEqual([SKIP_REFUSED_MESSAGE]);
    const local = io({ [NESTED_ENV]: '4242' });
    expect(await main(['--full'], local)).toBe(EXIT_OK);
    expect(local.lines[0]).toContain(NESTED_ENV);
  });

  it('refuses --skip-preflight in CI and allows it locally', async () => {
    const ci = io({ CI: 'true' });
    expect(await main(['--skip-preflight'], ci)).toBe(EXIT_USAGE);
    expect(ci.lines).toEqual([SKIP_REFUSED_MESSAGE]);
    const local = io();
    expect(await main(['--skip-preflight'], local)).toBe(EXIT_OK);
    expect(local.lines[0]).toContain('skipped');
  });

  it('rejects unknown flags', async () => {
    const out = io();
    expect(await main(['--nope'], out)).toBe(EXIT_USAGE);
  });
});

describe('main info and check modes', { timeout: REPO_SCAN_TIMEOUT_MS }, () => {
  it('explains a rule and ends with the REMINDERS block', async () => {
    const out = io();
    expect(await main(['--explain', 'file-budget'], out)).toBe(EXIT_OK);
    expect(out.lines[0]).toBe('file-budget (quick tier, error)');
    expect(out.lines).toContain('REMINDERS');
    expect(await main(['--explain', 'nope'], io())).toBe(EXIT_USAGE);
  });

  it('prints the context for a glob', async () => {
    const out = io();
    expect(await main(['--context', 'packages/db/**'], out)).toBe(EXIT_OK);
    expect(out.lines.some((line) => line.includes('AGENTS.md / Code limits'))).toBe(true);
  });

  it('writes the docs blocks with --docs', async () => {
    const rootDir = mkdtempSync(path.join(tmpdir(), 'preflight-docs-'));
    cpSync(fixtureDir('docs-in-sync', 'fail'), rootDir, { recursive: true });
    const out = io({}, rootDir);
    expect(await main(['--docs'], out)).toBe(EXIT_OK);
    expect(out.lines[0]).toBe('preflight --docs: updated DESIGN.md.');
    expect(readFileSync(path.join(rootDir, 'DESIGN.md'), 'utf8')).toContain('| `design-tokens`');
    const again = io({}, rootDir);
    await main(['--docs'], again);
    expect(again.lines[0]).toBe('preflight --docs: docs already up to date.');
  });

  it('runs a tier and prints a report, then the REMINDERS block', async () => {
    const out = io({}, fixtureDir('env-documented', 'pass'));
    expect(await main(['--quick'], out)).toBe(EXIT_FAILED);
    expect(out.lines[0]).toBe('preflight quick: 19 rules');
    expect(out.lines.at(-1)).toBe('REMINDERS');
  });

  it('prints JSON with the reminders for --json and --doctor', async () => {
    const out = io({}, fixtureDir('env-documented', 'pass'));
    await main(['--doctor', '--json'], out);
    const parsed = JSON.parse(out.lines.join('\n')) as { reminders: string[]; groups: unknown[] };
    expect(parsed.reminders).toEqual(['REMINDERS']);
    const human = io({}, fixtureDir('env-documented', 'pass'));
    await main(['--doctor'], human);
    expect(human.lines[0]).toBe('preflight doctor');
  });
});

describe('main --commit-msg', () => {
  it(
    'checks the staged change against the message being written',
    async () => {
      const repo = await createScratchRepo();
      repo.write('packages/core/src/a.ts');
      await repo.git('add', '--all');
      const messageFile = path.join(repo.rootDir, '.git', 'COMMIT_EDITMSG');
      writeFileSync(messageFile, 'feat: add a\n');
      const untagged = io({}, repo.rootDir, repo.exec);
      expect(await main(['--commit-msg', '.git/COMMIT_EDITMSG'], untagged)).toBe(EXIT_FAILED);
      expect(untagged.lines[0]).toBe('preflight commit-msg: tdd-pairing and commitlint');
      expect(untagged.lines.join('\n')).toContain('packages/core/src/a.ts');
      writeFileSync(messageFile, 'docs: a [no-test] #12\n');
      const tagged = io({}, repo.rootDir, repo.exec);
      expect(await main(['--commit-msg', messageFile], tagged)).toBe(EXIT_OK);
      // commitlint is not installed under the temp dir, so the REMINDERS block says so.
      expect(tagged.lines.slice(-2)).toEqual([
        'REMINDERS',
        '- commitlint is not installed; its check was skipped',
      ]);
    },
    SCRATCH_TIMEOUT_MS,
  );

  it('fails when the message file cannot be read', async () => {
    const out = io();
    expect(await main(['--commit-msg', '/nonexistent/msg'], out)).toBe(EXIT_USAGE);
    expect(out.lines[0]).toContain('cannot read');
  });
});
