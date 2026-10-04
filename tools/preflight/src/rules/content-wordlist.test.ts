import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { rule } from './content-wordlist.js';

describe('content-wordlist', () => {
  it('passes plain prose and words inside code spans', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails banned words in Markdown and locale strings', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ file, line }) => `${file ?? ''}:${String(line ?? '-')}`).sort()).toEqual([
      'apps/web/src/locales/en.json:-',
      'docs/guide.md:3',
    ]);
    expect(found.every(({ severity }) => severity === 'error')).toBe(true);
  });
});
