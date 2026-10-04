import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { blankCommentsAndStrings, magicNumbers, rule } from './constants-home.js';

describe('constants-home', () => {
  it('passes named constants, small numbers, array indexes, tests and catalog files', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('warns on a bare number in packages/core', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found).toEqual([expect.objectContaining({ line: 3, message: 'magic number 0.05' })]);
    expect(rule.severity).toBe('warn');
  });

  it('skips numbers in comments and strings', () => {
    expect(magicNumbers("// 42\nconst label = 'room 12';\n")).toEqual([]);
    expect(blankCommentsAndStrings("a('x')")).toBe('a(   )');
  });
});
