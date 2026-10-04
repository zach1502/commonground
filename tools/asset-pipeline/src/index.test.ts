import { describe, expect, it } from 'vitest';

import { assetFileName } from './index.js';

describe('assetFileName', () => {
  it('slugifies the label and shortens the hash', () => {
    expect(assetFileName('Big Leaf Maple', '0123456789abcdef', 'glb')).toBe(
      'big-leaf-maple.01234567.glb',
    );
    expect(assetFileName('  Picnic_Table!  ', 'abc', 'png')).toBe('picnic-table.abc.png');
  });
});
