import { describe, expect, it } from 'vitest';

import { fixtureContext, problems } from '../testing/fixture-context.js';

import { isVendorSdk, rule } from './adapter-boundary.js';

describe('adapter-boundary', () => {
  it('passes vendor imports in adapters, wrappers and API entries', async () => {
    expect(await problems(rule, fixtureContext(rule.id, 'pass'))).toEqual([]);
  });

  it('fails vendor imports and dependencies outside the allowed places', async () => {
    const found = await problems(rule, fixtureContext(rule.id, 'fail'));
    expect(found.map(({ file }) => file).sort()).toEqual([
      'apps/api/src/app.ts',
      'packages/core/src/mesh.ts',
      'packages/db/package.json',
    ]);
    expect(found.find(({ file }) => file === 'packages/core/src/mesh.ts')?.line).toBe(1);
  });

  it('matches vendor subpaths but not look-alike names', () => {
    expect(isVendorSdk('three/examples/jsm/controls')).toBe(true);
    expect(isVendorSdk('@react-three/fiber')).toBe(true);
    expect(isVendorSdk('threejs-helper')).toBe(false);
    expect(isVendorSdk('postprocessing')).toBe(true);
    expect(isVendorSdk('n8ao')).toBe(true);
    expect(isVendorSdk('hono')).toBe(false);
  });
});
