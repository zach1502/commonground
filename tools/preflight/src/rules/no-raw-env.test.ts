import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { rule } from './no-raw-env.js';

describe('no-raw-env', () => {
  it('passes env reads in packages/config, tools and config files', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails process.env and import.meta.env elsewhere', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ file }) => file).sort()).toEqual([
      'apps/web/src/api-url.ts',
      'packages/db/src/url.ts',
    ]);
  });
});
