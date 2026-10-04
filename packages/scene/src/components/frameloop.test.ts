import { describe, expect, it } from 'vitest';

import { frameloopFor } from './frameloop.js';

describe('frameloopFor', () => {
  it('draws only after a change when nobody measures frame times', () => {
    expect(frameloopFor(undefined)).toBe('demand');
  });

  it('draws every frame while the dev page counts frames', () => {
    expect(frameloopFor(() => undefined)).toBe('always');
  });
});
