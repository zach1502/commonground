import { readdirSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fixtureContext, problems, REPO_ROOT } from '../testing/fixture-context.js';
import type { RuleContext, Tier } from '../types.js';

import { rule } from './todo-audit.js';

describe('todo-audit', () => {
  it('passes linked markers and seed placeholders below the full tier', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails markers without an issue link', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ line }) => line)).toEqual([1, 2]);
  });

  it('fails seed placeholders in the full tier', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'pass', { tier: 'full' }));
    expect(found).toEqual([
      expect.objectContaining({ file: 'packages/db/seed/designs.md', line: 1 }),
    ]);
  });

  describe('the real showcase seed files', () => {
    const showcaseDir = 'packages/db/seed/showcase';
    const files = readdirSync(path.join(REPO_ROOT, showcaseDir)).map(
      (name) => `${showcaseDir}/${name}`,
    );
    const context = (tier: Tier): RuleContext => ({
      ...fixtureContext(rule.id, 'pass', { tier }),
      rootDir: REPO_ROOT,
      files,
      changedFiles: files,
    });

    it('flags each placeholder blurb in the full tier', async () => {
      const found = await problems(rule, context('full'));
      expect(found.map(({ file }) => file).sort()).toEqual([...files].sort());
    });

    it('lets the placeholders through below the full tier', async () => {
      expect(await problems(rule, context('standard'))).toEqual([]);
      expect(await problems(rule, context('quick'))).toEqual([]);
    });
  });
});
