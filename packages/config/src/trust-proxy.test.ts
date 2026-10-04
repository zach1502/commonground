import { describe, expect, it } from 'vitest';

import { loadConfig } from './index.js';

describe('TRUST_PROXY', () => {
  it('is off by default, so a caller cannot pick their own address', () => {
    expect(loadConfig({}).TRUST_PROXY).toBe(false);
  });

  it('turns on with true', () => {
    expect(loadConfig({ TRUST_PROXY: 'true' }).TRUST_PROXY).toBe(true);
  });

  it('refuses a value that is not true or false', () => {
    expect(() => loadConfig({ TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });
});
