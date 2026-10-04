import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { directivesIn, rule } from './disable-audit.js';

describe('disable-audit', () => {
  it('passes directives with a reason and an issue link', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails unjustified directives and a package over the cap', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ file, line }) => `${file ?? ''}:${String(line ?? '-')}`)).toEqual([
      'packages/core/src/a.ts:1',
      'packages/core/src/a.ts:3',
      'packages/db:-',
    ]);
    expect(found[1]?.message).toBe(
      'eslint-disable-next-line needs a rule name and "-- reason (#issue)" on the same line',
    );
    expect(found[2]?.message).toBe('6 disable comments, cap is 5');
  });

  it('requires an eslint directive to name the rule it turns off', () => {
    // Built from parts so this file's own disable-audit scan does not count the test data.
    const comment = (directive: string, rest: string) => `// ${directive} ${rest}`.trimEnd();
    const next = ['eslint', 'disable-next-line'].join('-');
    const justified = (line: string) => directivesIn('a.ts', line)[0]?.justified;
    expect(justified(comment(next, '-- why (#1)'))).toBe(false);
    expect(justified(comment(['eslint', 'disable'].join('-'), '-- why (#1)'))).toBe(false);
    expect(justified(comment(next, 'no-console -- why (#1)'))).toBe(true);
    expect(justified(comment(next, '@typescript-eslint/no-explicit-any, x -- why (#1)'))).toBe(
      true,
    );
    expect(justified(comment(next, '<rule> -- reason (#12)'))).toBe(true);
    const expectError = ['@ts', 'expect-error'].join('-');
    expect(justified(comment(expectError, '-- why (#1)'))).toBe(true);
    expect(justified(comment(expectError, 'missing reason'))).toBe(false);
  });
});
