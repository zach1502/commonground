import { describe, expect, it } from 'vitest';

import {
  documentPropertyReader,
  PALETTE_FALLBACKS,
  PALETTE_PROPERTIES,
  readPalette,
  statusColour,
} from './colours.js';

describe('readPalette', () => {
  it('uses the fallbacks when no custom property is set', () => {
    expect(readPalette(() => '')).toEqual(PALETTE_FALLBACKS);
  });

  it('takes BC support tokens and domain properties from the page when present', () => {
    const values: Record<string, string> = {
      '--support-border-color-danger': ' #ce3e39 ',
      '--parkshape-water': '#2f6f8f',
    };
    const palette = readPalette((name) => values[name] ?? '');
    expect(palette.danger).toBe('#ce3e39');
    expect(palette.water).toBe('#2f6f8f');
    expect(palette.soil).toBe(PALETTE_FALLBACKS.soil);
  });
});

describe('sky', () => {
  it('is the pale water tint from DESIGN.md and reads --parkshape-sky', () => {
    expect(PALETTE_FALLBACKS.sky).toBe('#cfe3f0');
    expect(PALETTE_PROPERTIES.sky).toBe('--parkshape-sky');
    expect(readPalette((name) => (name === '--parkshape-sky' ? '#dde9f2' : '')).sky).toBe(
      '#dde9f2',
    );
  });
});

describe('foliage', () => {
  it('sits within 10 degrees of the grass hue', () => {
    expect(PALETTE_FALLBACKS.foliage).toBe('#5a7d43');
    expect(PALETTE_FALLBACKS.foliageDark).toBe('#466134');
    expect(PALETTE_PROPERTIES.foliage).toBe('--parkshape-foliage');
  });
});

describe('context layer colours', () => {
  it('read the BC grey and blue theme tokens, matching design-tokens 5.0.0', () => {
    expect(PALETTE_PROPERTIES.contextStreet).toBe('--theme-gray-60');
    expect(PALETTE_PROPERTIES.contextSidewalk).toBe('--theme-gray-30');
    expect(PALETTE_PROPERTIES.contextParking).toBe('--theme-gray-80');
    expect(PALETTE_PROPERTIES.contextAccent).toBe('--theme-blue-70');
    expect(PALETTE_FALLBACKS.contextStreet).toBe('#c6c5c3');
    expect(PALETTE_FALLBACKS.contextSidewalk).toBe('#eceae8');
    expect(PALETTE_FALLBACKS.contextParking).toBe('#605e5c');
    expect(PALETTE_FALLBACKS.contextAccent).toBe('#5595d9');
  });

  it('keep the accent apart from the focus blue', () => {
    expect(PALETTE_FALLBACKS.contextAccent).not.toBe(PALETTE_FALLBACKS.focus);
  });
});

describe('statusColour', () => {
  it('maps each status to its support colour', () => {
    expect(statusColour(PALETTE_FALLBACKS, 'success')).toBe(PALETTE_FALLBACKS.success);
    expect(statusColour(PALETTE_FALLBACKS, 'warning')).toBe(PALETTE_FALLBACKS.warning);
    expect(statusColour(PALETTE_FALLBACKS, 'danger')).toBe(PALETTE_FALLBACKS.danger);
    expect(statusColour(PALETTE_FALLBACKS, 'info')).toBe(PALETTE_FALLBACKS.info);
  });
});

describe('documentPropertyReader', () => {
  it('reads nothing when there is no document', () => {
    expect(documentPropertyReader()('--parkshape-water')).toBe('');
  });
});
