import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { rule } from './file-budget.js';

describe('file-budget', () => {
  it('passes short files and skips lockfiles and generated files', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails CSS over 300 lines and Markdown over 400 lines', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ message }) => message)).toEqual([
      '302 lines, budget is 300',
      '402 lines, budget is 400',
    ]);
  });
});
