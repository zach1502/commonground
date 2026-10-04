import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { changedFilesForTier } from '../git.js';
import { fixtureContext, problems } from '../testing/fixture-context.js';
import {
  createScratchRepo,
  SCRATCH_TIMEOUT_MS,
  type ScratchRepo,
} from '../testing/scratch-repo.js';
import type { RuleContext, Tier } from '../types.js';

import { hasNoTestTag, isBarrelSource, rule, unpairedSources } from './tdd-pairing.js';

const FAIL_FILES = [
  'apps/web/src/pages/vote-page.tsx',
  'packages/core/src/grade.ts',
  'packages/scene/src/index.ts',
];

describe('tdd-pairing', () => {
  it('passes a changed source file with a changed test in its package', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails changed source files with no changed test', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ file }) => file).sort()).toEqual(FAIL_FILES);
  });

  it('treats an index file as a barrel only when it holds nothing but re-exports', () => {
    expect(
      isBarrelSource("export {\n  a,\n  b,\n} from './a.js';\nexport * from './b.js';\n"),
    ).toBe(true);
    expect(isBarrelSource("// why\nexport type { A } from './a.js';\n")).toBe(true);
    expect(isBarrelSource("export { a } from './a.js';\nexport const B = 'b';\n")).toBe(false);
  });

  it('ignores barrels, declarations, configs and fixtures', () => {
    expect(
      unpairedSources([
        'packages/core/src/index.ts',
        'packages/core/src/env.d.ts',
        'apps/web/vite.config.ts',
        'tools/preflight/fixtures/rules/x/src/a.ts',
      ]),
    ).toEqual([]);
  });
});

describe('tdd-pairing [no-test] exemption', () => {
  it('fails when the message being written lacks the tag', async () => {
    const ctx = fixtureContext(rule.id, 'fail', { commitMessage: 'feat: add grade\n' });
    expect(await problems(rule, ctx)).toHaveLength(FAIL_FILES.length);
  });

  it('passes when the message being written has [no-test] and an issue link', async () => {
    const ctx = fixtureContext(rule.id, 'fail', {
      commitMessage: 'docs: fix typo [no-test] #12\n',
    });
    expect(await problems(rule, ctx)).toEqual([]);
  });

  it('rejects [no-test] without an issue link, and ignores git comment lines', () => {
    expect(hasNoTestTag('docs: fix typo [no-test]\n')).toBe(false);
    expect(hasNoTestTag('docs: fix typo\n# [no-test] #12\n')).toBe(false);
    expect(hasNoTestTag('docs: fix typo\n\nRefs #12 [no-test]\n')).toBe(true);
  });

  it('warns in the quick tier when no message is known yet', async () => {
    const findings = await rule.check(fixtureContext(rule.id, 'fail', { tier: 'quick' }));
    expect(findings.map(({ severity }) => severity)).toEqual(['warn', 'warn', 'warn']);
    expect(findings[0]?.message).toContain('commit-msg hook');
  });
});

async function repoContext(repo: ScratchRepo, tier: Tier): Promise<RuleContext> {
  const change = await changedFilesForTier(repo.exec, repo.rootDir, { tier, env: {} });
  return {
    ...fixtureContext(rule.id, 'pass', { tier, exec: repo.exec }),
    rootDir: repo.rootDir,
    changedFiles: change.files,
    ...(change.base === undefined ? {} : { mergeBase: change.base }),
  };
}

describe('tdd-pairing with real git history', () => {
  it(
    'does not let the previous commit message exempt the current change',
    async () => {
      const repo = await createScratchRepo();
      repo.write('packages/core/src/a.ts');
      await repo.commit('docs: a [no-test] #12');
      // A leftover message file from the last commit, as git leaves it.
      writeFileSync(path.join(repo.rootDir, '.git', 'COMMIT_EDITMSG'), 'docs: a [no-test] #12\n');
      repo.write('packages/core/src/b.ts');
      await repo.git('add', '--all');
      const ctx = await repoContext(repo, 'standard');
      expect((await problems(rule, ctx)).map(({ file }) => file)).toEqual([
        'packages/core/src/b.ts',
      ]);
      const writing = { ...ctx, commitMessage: 'feat: b\n' };
      expect(await problems(rule, writing)).toHaveLength(1);
    },
    SCRATCH_TIMEOUT_MS,
  );

  it(
    'exempts only the files of tagged commits in the full tier',
    async () => {
      const repo = await createScratchRepo();
      const base = await repo.commit('chore: start');
      await repo.git('update-ref', 'refs/remotes/origin/main', base);
      repo.write('packages/core/src/a.ts');
      await repo.commit('docs: a [no-test] #12');
      repo.write('packages/core/src/b.ts');
      await repo.commit('feat: b');
      repo.write('packages/core/src/c.ts');
      const ctx = await repoContext(repo, 'full');
      expect(ctx.mergeBase).toBe(base);
      expect((await problems(rule, ctx)).map(({ file }) => file)).toEqual([
        'packages/core/src/b.ts',
        'packages/core/src/c.ts',
      ]);
    },
    SCRATCH_TIMEOUT_MS,
  );
});
