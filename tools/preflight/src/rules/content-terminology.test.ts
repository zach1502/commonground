import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { rule } from './content-terminology.js';

describe('content-terminology', () => {
  it('passes locales that use only the chosen terms', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('flags each planted synonym in a locale value', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    const terms = found.map(({ message }) => /"([^"]+)"/.exec(message)?.[1]).sort();
    expect(terms).toEqual(['asset', 'check', 'constraint', 'plan', 'rate', 'staff', 'submission']);
    expect(found.every(({ severity }) => severity === 'error')).toBe(true);
  });

  it('runs in the quick tier', () => {
    expect(rule.tier).toBe('quick');
  });
});
