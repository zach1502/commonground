import { describe, expect, it } from 'vitest';

import { truncateForModel } from './truncate.js';

const LIMIT = 10;

describe('truncateForModel', () => {
  it('leaves short text alone', () => {
    expect(truncateForModel('short', LIMIT)).toBe('short');
  });

  it('cuts long text and marks the cut within the limit', () => {
    const result = truncateForModel('a meadow with a winding path', LIMIT);
    expect(result).toBe('a meado...');
    expect(result).toHaveLength(LIMIT);
  });
});
