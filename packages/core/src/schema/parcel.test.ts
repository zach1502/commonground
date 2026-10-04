import { describe, expect, it } from 'vitest';

import { parcelAreaM2, parcelContains, parcelSchema, type ParcelInput } from './parcel.js';
import { metres } from './units.js';

const square: ParcelInput = {
  id: 'jonathan-rogers',
  name: 'Jonathan Rogers Park',
  polygon: [
    { x: 0, y: 0 },
    { x: 120, y: 0 },
    { x: 120, y: 115 },
    { x: 0, y: 115 },
  ],
  origin: { lat: 49.2637, lon: -123.0972 },
};

const concave: ParcelInput = {
  ...square,
  polygon: [
    { x: 0, y: 0 },
    { x: 100, y: 0 },
    { x: 100, y: 40 },
    { x: 40, y: 40 },
    { x: 40, y: 100 },
    { x: 0, y: 100 },
  ],
};

const at = (x: number, y: number) => ({ x: metres(x), y: metres(y) });

describe('parcelSchema', () => {
  it('parses a parcel and round-trips it through JSON', () => {
    const parsed = parcelSchema.parse(square);
    expect(parcelSchema.parse(JSON.parse(JSON.stringify(parsed)))).toEqual(parsed);
  });

  it('rejects an origin off the globe', () => {
    expect(parcelSchema.safeParse({ ...square, origin: { lat: 91, lon: 0 } }).success).toBe(false);
    expect(parcelSchema.safeParse({ ...square, origin: { lat: 0, lon: -181 } }).success).toBe(
      false,
    );
  });
});

describe('parcelAreaM2', () => {
  it('computes the area of the demo parcel', () => {
    expect(parcelAreaM2(parcelSchema.parse(square))).toBe(13800);
  });
});

describe('parcelContains', () => {
  it('works on a square parcel', () => {
    const parcel = parcelSchema.parse(square);
    expect(parcelContains(parcel, at(60, 60))).toBe(true);
    expect(parcelContains(parcel, at(121, 60))).toBe(false);
  });

  it('works on a concave parcel', () => {
    const parcel = parcelSchema.parse(concave);
    expect(parcelContains(parcel, at(20, 80))).toBe(true);
    expect(parcelContains(parcel, at(80, 20))).toBe(true);
    expect(parcelContains(parcel, at(80, 80))).toBe(false);
  });
});
