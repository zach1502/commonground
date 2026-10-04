import { describe, expect, it } from 'vitest';

import {
  cad,
  cubicMetres,
  metres,
  percent,
  positiveMetresSchema,
  slope,
  squareMetres,
  sumCad,
} from './units.js';

describe('unit constructors', () => {
  it('returns the number for valid values', () => {
    expect(metres(-1.5)).toBe(-1.5);
    expect(squareMetres(250)).toBe(250);
    expect(cubicMetres(12)).toBe(12);
    expect(cad(4200)).toBe(4200);
    expect(percent(35)).toBe(35);
    expect(slope(0.05)).toBe(0.05);
  });

  it('rejects values outside each unit range', () => {
    expect(() => metres(Number.NaN)).toThrow();
    expect(() => metres(Number.POSITIVE_INFINITY)).toThrow();
    expect(() => squareMetres(-1)).toThrow();
    expect(() => cubicMetres(-1)).toThrow();
    expect(() => cad(-0.01)).toThrow();
    expect(() => percent(101)).toThrow();
    expect(() => slope(-0.1)).toThrow();
  });

  it('requires positive metres for sizes', () => {
    expect(positiveMetresSchema.safeParse(0).success).toBe(false);
    expect(positiveMetresSchema.safeParse(-2).success).toBe(false);
    expect(positiveMetresSchema.safeParse(1.2).success).toBe(true);
  });
});

describe('sumCad', () => {
  it('adds amounts and returns 0 for an empty list', () => {
    expect(sumCad([cad(1500), cad(2500.5)])).toBe(4000.5);
    expect(sumCad([])).toBe(0);
  });
});
