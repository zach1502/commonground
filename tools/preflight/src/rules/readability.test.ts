import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { rule } from './readability.js';

describe('readability', () => {
  it('passes plain locale strings and plain doc paragraphs', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails hard locale strings and hard doc paragraphs, and skips package READMEs', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ file, line }) => `${file ?? ''}:${String(line ?? '-')}`).sort()).toEqual([
      'apps/web/src/locales/en.json:-',
      'docs/guide.md:3',
    ]);
    expect(found.every(({ severity }) => severity === 'error')).toBe(true);
    expect(found[0]?.message).toMatch(/grade \d+\.\d; the limit is/);
  });

  it('runs in the quick tier', () => {
    expect(rule.tier).toBe('quick');
  });
});
