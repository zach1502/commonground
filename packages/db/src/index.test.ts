import { describe, expect, it } from 'vitest';

import { databaseDriver } from './index.js';

describe('databaseDriver', () => {
  it('maps URL schemes to drivers', () => {
    expect(databaseDriver({ DATABASE_URL: 'pglite://.data/parkshape' })).toBe('pglite');
    expect(databaseDriver({ DATABASE_URL: 'postgres://db.example/parkshape' })).toBe('postgres');
  });
});
