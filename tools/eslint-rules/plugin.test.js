import { describe, expect, it } from 'vitest';

import { parkshapePlugin } from './plugin.js';

describe('parkshape ESLint plugin', () => {
  it('registers every local rule by name', () => {
    expect(Object.keys(parkshapePlugin.rules).sort()).toEqual([
      'no-boolean-flag-params',
      'no-literal-jsx-text',
    ]);
  });
});
