import { describe, expect, it } from 'vitest';

import { parcelDepthRatio } from './stage-aspect';

const SEEDED = [
  { x: 0.28, y: 85.48 },
  { x: 175.21, y: 80.54 },
  { x: 173.03, y: 0 },
  { x: 0, y: 4.75 },
];

describe('parcelDepthRatio', () => {
  it('gives the seeded park its depth over width, about 1 to 2', () => {
    expect(parcelDepthRatio({ polygon: SEEDED })).toBe('0.488');
  });

  it('falls back to the picture shape for a parcel it cannot read', () => {
    expect(parcelDepthRatio({})).toBe('0.625');
    expect(parcelDepthRatio({ polygon: [{ x: 0, y: 0 }] })).toBe('0.625');
  });
});
