import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { rule, specNames } from './openapi-drift.js';

describe('openapi-drift', () => {
  it('passes when the client names every path and operation', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails an operation missing from the client', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found).toHaveLength(1);
    expect(found[0]?.message).toContain('createDesign');
  });

  it('is not applicable before the spec exists', async () => {
    const ctx = {
      ...fixtureContext(rule.id, 'pass'),
      rootDir: fixtureContext('file-budget', 'pass').rootDir,
    };
    expect(await rule.check(ctx)).toEqual([expect.objectContaining({ severity: 'info' })]);
  });

  it('ignores non-method keys', () => {
    expect(specNames({ paths: { '/a': { parameters: {}, get: {} } } })).toEqual(['/a']);
  });
});
