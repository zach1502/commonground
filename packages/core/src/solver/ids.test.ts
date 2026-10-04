import { describe, expect, it } from 'vitest';

import { createIdSource } from './ids.js';

describe('createIdSource', () => {
  it('counts up and skips ids already in use', () => {
    const ids = createIdSource(['gen-2']);
    expect([ids.next(), ids.next(), ids.next()]).toEqual(['gen-1', 'gen-3', 'gen-4']);
  });
});
