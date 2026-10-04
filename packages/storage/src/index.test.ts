import { describe, expect, it } from 'vitest';

import { blobKey } from './index.js';

describe('blobKey', () => {
  it('joins segments with single slashes', () => {
    expect(blobKey('renders', 'site-1', 'top.png')).toBe('renders/site-1/top.png');
    expect(blobKey('/renders/', '', 'top.png')).toBe('renders/top.png');
  });
});
