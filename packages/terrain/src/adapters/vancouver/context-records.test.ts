import { describe, expect, it } from 'vitest';

import { parkingStalls, rightOfWayMetres, streetName, streetWidthM } from './context-records.js';

describe('streetName', () => {
  it('drops the block number and writes the street the way signs do', () => {
    expect(streetName('100 W 7TH AV')).toBe('W 7th Ave');
    expect(streetName('2600 COLUMBIA ST')).toBe('Columbia St');
    expect(streetName('0 E BROADWAY')).toBe('E Broadway');
    expect(streetName('1000 KINGSWAY')).toBe('Kingsway');
    expect(streetName('300 W 1ST AV')).toBe('W 1st Ave');
  });

  it('drops the side letter of a sidewalk record when asked', () => {
    expect(streetName('2100 QUEBEC ST E', { side: 'drop' })).toBe('Quebec St');
    expect(streetName('200 W 5TH AV S', { side: 'drop' })).toBe('W 5th Ave');
    expect(streetName('200 W 5TH AV S')).toBe('W 5th Ave S');
  });

  it('gives undefined for a record with no street words', () => {
    expect(streetName('  ')).toBeUndefined();
    expect(streetName('2600')).toBeUndefined();
  });
});

describe('rightOfWayMetres', () => {
  it('reads metres as given and feet past 40 as feet', () => {
    expect(rightOfWayMetres('20')).toBe(20);
    expect(rightOfWayMetres('66')).toBeCloseTo(20.12, 2);
    expect(rightOfWayMetres('n/a')).toBeUndefined();
  });
});

describe('streetWidthM', () => {
  it('takes 8 m of sidewalk and boulevard off the right-of-way', () => {
    expect(streetWidthM(18)).toBe(10);
  });

  it('keeps the width between 6 and 12 m', () => {
    expect(streetWidthM(10)).toBe(6);
    expect(streetWidthM(30)).toBe(12);
  });

  it('rounds to the decimetre', () => {
    expect(streetWidthM(18.5136)).toBe(10.5);
  });

  it('uses 8 m when no width is recorded nearby', () => {
    expect(streetWidthM(undefined)).toBe(8);
  });
});

describe('parkingStalls', () => {
  const street = {
    points: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ],
    widthM: 10,
  };

  it('lays a 6 by 2.4 m stall along the street at the curb on the meter side', () => {
    const [stall] = parkingStalls({ x: 50, y: 7 }, street, 1);
    expect(stall).toEqual([
      { x: 47, y: 2.6 },
      { x: 53, y: 2.6 },
      { x: 53, y: 5 },
      { x: 47, y: 5 },
    ]);
  });

  it('puts the stall on the south curb for a meter south of the street', () => {
    const [stall] = parkingStalls({ x: 50, y: -7 }, street, 1);
    const ys = (stall ?? []).map((point) => point.y);
    expect(Math.min(...ys)).toBe(-5);
    expect(Math.max(...ys)).toBe(-2.6);
  });

  it('lays one stall per space, end to end', () => {
    const stalls = parkingStalls({ x: 50, y: 7 }, street, 2);
    expect(stalls).toHaveLength(2);
    const xs = stalls.flat().map((point) => point.x);
    expect(Math.min(...xs)).toBe(44);
    expect(Math.max(...xs)).toBe(56);
  });
});
