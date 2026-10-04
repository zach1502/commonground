import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { rule } from './content-redundancy.js';

describe('content-redundancy', () => {
  it('passes locales with only incidental overlap and real captions', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails banned openers, label echoes and obvious control text', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    const pointers = found.map(({ message }) => message.split(':')[0]).sort();
    expect(pointers).toEqual(['/canopy/help', '/chart/note', '/submit/help']);
    expect(found.every(({ severity }) => severity === 'error')).toBe(true);
  });

  it('runs in the quick tier', () => {
    expect(rule.tier).toBe('quick');
  });
});
