import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { attributionText, rule, sourceNames } from './licence-attribution.js';

describe('licence-attribution', () => {
  it('passes when every source is credited', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails a source missing from the attribution string', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('Vancouver Open Data');
  });

  it('is not applicable without a manifest', async () => {
    const ctx = {
      ...fixtureContext(rule.id, 'pass'),
      rootDir: fixtureContext('file-budget', 'pass').rootDir,
    };
    expect(await rule.check(ctx)).toEqual([expect.objectContaining({ severity: 'info' })]);
  });

  it('reads names from arrays and objects', () => {
    expect(sourceNames([{ source: 'A' }, 'B', 7])).toEqual(['A', 'B']);
    expect(sourceNames(undefined)).toEqual([]);
    expect(attributionText({ credits: { attribution: { map: 'OSM' } }, title: 'x' })).toBe('OSM\n');
  });
});
