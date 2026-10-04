import { describe, expect, it } from 'vitest';

import { screenSize } from '@parkshape/scene/editor';

import { EDITOR_MIN_WIDTH_PX, landingLayout } from './landing-width';

describe('landingLayout', () => {
  it('uses the editor breakpoint from the scene package', () => {
    expect(screenSize(EDITOR_MIN_WIDTH_PX)).toBe('desktop');
    expect(screenSize(EDITOR_MIN_WIDTH_PX - 1)).toBe('small');
  });

  it('leads with voting below the breakpoint and with design at or above it', () => {
    expect(landingLayout(EDITOR_MIN_WIDTH_PX - 1)).toBe('vote-first');
    expect(landingLayout(EDITOR_MIN_WIDTH_PX)).toBe('design-first');
  });
});
