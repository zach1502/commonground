import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { rule } from './content-patterns.js';

describe('content-patterns', () => {
  it('passes sentence-case prose and rules inside fenced code', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails title case, negative parallelism, rules, bold-label bullets and UI exclamations', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    const lines = found.filter(({ file }) => file === 'docs/guide.md').map(({ line }) => line);
    expect(lines.sort()).toEqual([1, 3, 5, 7]);
    expect(found.some(({ file }) => file === 'apps/web/src/locales/en.json')).toBe(true);
  });
});
