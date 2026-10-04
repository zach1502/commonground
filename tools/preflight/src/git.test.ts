import { describe, expect, it } from 'vitest';

import {
  changedFiles,
  changedFilesForTier,
  changeScopeFor,
  commitsSince,
  mergeBase,
} from './git.js';
import { createScratchRepo, SCRATCH_TIMEOUT_MS } from './testing/scratch-repo.js';
import type { Exec } from './types.js';

/** A fake git that answers from a table of argument strings. */
function fakeGit(answers: Record<string, string | undefined>): Exec {
  return (_command, args) => {
    const stdout = answers[args.join(' ')];
    return Promise.resolve({
      code: stdout === undefined ? 1 : 0,
      stdout: stdout ?? '',
      stderr: '',
    });
  };
}

const HEAD = { 'rev-parse --verify --quiet HEAD': 'abc\n' };
const ORIGIN_AT_HEAD = { 'rev-parse --verify --quiet origin/main^{commit}': 'abc\n' };
const BEFORE = 'b'.repeat(40);

describe('changedFiles', () => {
  it('uses the diff against HEAD plus untracked files', async () => {
    const exec = fakeGit({
      ...HEAD,
      'diff --name-only HEAD': 'b.ts\na.ts\n',
      'ls-files --others --exclude-standard': 'c.md\na.ts\ndist/x.js\n',
    });
    expect(await changedFiles(exec, '/r', 'working-tree')).toEqual(['a.ts', 'b.ts', 'c.md']);
  });

  it('treats every file as changed when there are no commits', async () => {
    const exec = fakeGit({
      'ls-files': 'a.ts\n',
      'ls-files --others --exclude-standard': 'b.ts\n',
    });
    expect(await changedFiles(exec, '/r', 'working-tree')).toEqual(['a.ts', 'b.ts']);
    expect(await changedFiles(exec, '/r', 'merge-base')).toEqual(['a.ts', 'b.ts']);
  });

  it('uses only staged files for the quick tier', async () => {
    const exec = fakeGit({ 'diff --cached --name-only --diff-filter=ACMR': 's.ts\n' });
    expect(await changedFiles(exec, '/r', 'staged')).toEqual(['s.ts']);
  });
});

describe('changeScopeFor', () => {
  it('picks staged for quick, working tree for standard and the merge base for full or CI', () => {
    expect(changeScopeFor('quick', {})).toBe('staged');
    expect(changeScopeFor('standard', {})).toBe('working-tree');
    expect(changeScopeFor('full', {})).toBe('merge-base');
    expect(changeScopeFor('standard', { CI: 'true' })).toBe('merge-base');
    expect(changeScopeFor('standard', { CI: 'false' })).toBe('working-tree');
  });
});

describe('mergeBase', () => {
  it('prefers origin/main, then main, then the root commit', async () => {
    const root = { 'rev-list --max-parents=0 HEAD': 'r00t\n' };
    const origin = fakeGit({
      ...HEAD,
      ...root,
      'rev-parse --verify --quiet origin/main^{commit}': 'b1\n',
      'merge-base origin/main HEAD': 'b1\n',
    });
    expect(await mergeBase(origin, '/r')).toBe('b1');
    const local = fakeGit({
      ...HEAD,
      ...root,
      'rev-parse --verify --quiet main^{commit}': 'b2\n',
      'merge-base main HEAD': 'b2\n',
    });
    expect(await mergeBase(local, '/r')).toBe('b2');
    expect(await mergeBase(fakeGit({ ...HEAD, ...root }), '/r')).toBe('r00t');
    expect(await mergeBase(fakeGit({}), '/r')).toBeUndefined();
  });

  it('uses HEAD~1 when origin/main is HEAD, as on a push to main', async () => {
    const exec = fakeGit({
      ...HEAD,
      ...ORIGIN_AT_HEAD,
      'rev-parse --verify --quiet HEAD~1^{commit}': 'p4r3nt\n',
      'rev-list --max-parents=0 HEAD': 'r00t\n',
    });
    expect(await mergeBase(exec, '/r', {})).toBe('p4r3nt');
  });

  it('uses PARKSHAPE_BASE_REF when it names a commit', async () => {
    const exec = fakeGit({
      ...HEAD,
      ...ORIGIN_AT_HEAD,
      [`cat-file -e ${BEFORE}^{commit}`]: '',
    });
    expect(await mergeBase(exec, '/r', { PARKSHAPE_BASE_REF: BEFORE })).toBe(BEFORE);
  });

  it('ignores a PARKSHAPE_BASE_REF of all zeros or one that does not resolve', async () => {
    const zeros = '0'.repeat(40);
    const exec = fakeGit({
      ...HEAD,
      [`cat-file -e ${zeros}^{commit}`]: '',
      'rev-parse --verify --quiet origin/main^{commit}': 'b1\n',
      'merge-base origin/main HEAD': 'b1\n',
    });
    expect(await mergeBase(exec, '/r', { PARKSHAPE_BASE_REF: zeros })).toBe('b1');
    expect(await mergeBase(exec, '/r', { PARKSHAPE_BASE_REF: 'gone' })).toBe('b1');
  });
});

describe('changedFilesForTier', () => {
  it('diffs the working tree against the merge base in the full tier', async () => {
    const exec = fakeGit({
      ...HEAD,
      'rev-parse --verify --quiet origin/main^{commit}': 'b1\n',
      'merge-base origin/main HEAD': 'b1\n',
      'diff --name-only b1': 'a.ts\n',
      'ls-files --others --exclude-standard': 'n.ts\n',
    });
    expect(await changedFilesForTier(exec, '/r', { tier: 'full', env: {} })).toEqual({
      files: ['a.ts', 'n.ts'],
      scope: 'merge-base',
      base: 'b1',
    });
  });

  it('has no base outside the merge-base scope', async () => {
    const exec = fakeGit({ 'diff --cached --name-only --diff-filter=ACMR': 's.ts\n' });
    expect(await changedFilesForTier(exec, '/r', { tier: 'quick', env: {} })).toEqual({
      files: ['s.ts'],
      scope: 'staged',
    });
  });

  it(
    'lists the files changed since the merge base in a real repo',
    async () => {
      const repo = await createScratchRepo();
      repo.write('base.ts');
      repo.write('kept.ts');
      const base = await repo.commit('feat: base');
      await repo.git('update-ref', 'refs/remotes/origin/main', base);
      repo.write('base.ts', 'export const value = 2;\n');
      repo.write('added.ts');
      await repo.commit('feat: second');
      repo.write('untracked.ts');
      const change = await changedFilesForTier(repo.exec, repo.rootDir, { tier: 'full', env: {} });
      expect(change).toEqual({
        files: ['added.ts', 'base.ts', 'untracked.ts'],
        scope: 'merge-base',
        base,
      });
      const standard = await changedFilesForTier(repo.exec, repo.rootDir, {
        tier: 'standard',
        env: {},
      });
      expect(standard.files).toEqual(['untracked.ts']);
    },
    SCRATCH_TIMEOUT_MS,
  );
});

describe('changedFilesForTier on a push to main', () => {
  it(
    'lists the files in the last commit when origin/main is HEAD',
    async () => {
      const repo = await createScratchRepo();
      repo.write('first.ts');
      const first = await repo.commit('feat: first');
      repo.write('first.ts', 'export const value = 2;\n');
      repo.write('pushed.ts');
      const head = await repo.commit('feat: pushed');
      await repo.git('update-ref', 'refs/remotes/origin/main', head);
      const change = await changedFilesForTier(repo.exec, repo.rootDir, { tier: 'full', env: {} });
      expect(change).toEqual({
        files: ['first.ts', 'pushed.ts'],
        scope: 'merge-base',
        base: first,
      });
    },
    SCRATCH_TIMEOUT_MS,
  );
});

describe('commitsSince', () => {
  it(
    'lists each commit after the base with its message and files',
    async () => {
      const repo = await createScratchRepo();
      const base = await repo.commit('chore: start');
      repo.write('a.ts');
      await repo.commit('docs: a [no-test] #12');
      repo.write('b.ts');
      await repo.commit('feat: b');
      const commits = await commitsSince(repo.exec, repo.rootDir, base);
      expect(commits.map(({ message, files }) => [message.trim(), files])).toEqual([
        ['docs: a [no-test] #12', ['a.ts']],
        ['feat: b', ['b.ts']],
      ]);
    },
    SCRATCH_TIMEOUT_MS,
  );

  it('returns nothing when git fails', async () => {
    expect(await commitsSince(fakeGit({}), '/r', 'b1')).toEqual([]);
  });
});
