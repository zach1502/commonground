// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import { motionPreference } from './motion/rise.js';
import { documentPropertyReader } from './palette/colours.js';

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.style.removeProperty('--parkshape-water');
});

describe('motionPreference in a browser', () => {
  it('follows prefers-reduced-motion', () => {
    vi.stubGlobal('matchMedia', (query: string) => ({ matches: query.includes('reduce') }));
    expect(motionPreference()).toBe('reduced');
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(motionPreference()).toBe('full');
  });
});

describe('documentPropertyReader in a browser', () => {
  it('reads custom properties from the document root', () => {
    document.documentElement.style.setProperty('--parkshape-water', '#2f6f8f');
    expect(documentPropertyReader()('--parkshape-water')).toBe('#2f6f8f');
  });
});
