import { describe, expect, it } from 'vitest';

import { compileTermBans, lintTermBans } from './term-bans.js';

const matchers = compileTermBans([
  'staff',
  'plan',
  'submission',
  'constraint',
  'check',
  'asset',
  'rate',
]);

function findings(tree) {
  return lintTermBans(JSON.stringify(tree), matchers);
}

describe('lintTermBans', () => {
  it('flags a rejected synonym as a whole word, case insensitive', () => {
    const found = findings({ home: { role: 'Staff sign in' } });
    expect(found).toHaveLength(1);
    expect(found[0]?.pointer).toBe('/home/role');
    expect(found[0]?.term).toBe('staff');
    expect(found[0]?.severity).toBe('error');
  });

  it('flags each concept synonym once per value', () => {
    const found = findings({
      a: { label: 'Submit your plan' },
      b: { note: 'This check is a constraint on the submission.' },
    });
    expect(found.map(({ term }) => term).sort()).toEqual([
      'check',
      'constraint',
      'plan',
      'submission',
    ]);
  });

  it('does not flag the chosen terms', () => {
    expect(
      findings({ ok: { a: 'Planner', b: 'design', c: 'rule', d: 'item', e: 'vote' } }),
    ).toEqual([]);
  });

  it('matches whole words only, so it leaves substrings alone', () => {
    expect(findings({ ok: { a: 'The rating aggregate and planner overview' } })).toEqual([]);
  });
});
