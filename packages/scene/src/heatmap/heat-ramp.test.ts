import { describe, expect, it } from 'vitest';

import { acesFilmic, inverseAcesFilmic } from '../components/tone.js';
import { linearRgb, srgbByte } from '../geometry/terrain-colours.js';

import { gridToRgba, heatShades, normaliseHeat, rampLinear, singleHueRamp } from './heat-ramp.js';
import { heatTexture, upsampleHeat } from './heat-upsample.js';

describe('singleHueRamp', () => {
  it('runs from a light tint of the colour to the colour itself', () => {
    const ramp = singleHueRamp('#3f7fa6');
    expect(ramp.high).toEqual([63, 127, 166]);
    // 45 percent of the way to white keeps the hue and lifts the value.
    expect(ramp.low).toEqual([149, 185, 206]);
  });

  it('rejects a colour that is not six-digit hex', () => {
    expect(() => singleHueRamp('blue')).toThrow(RangeError);
  });
});

describe('gridToRgba', () => {
  it('matches the snapshot for a small grid', () => {
    const grid = Float32Array.from([0, 0.25, 0.5, 1, 1.5, -1]);
    expect(Array.from(gridToRgba(grid, heatShades(singleHueRamp('#3f7fa6')))))
      .toMatchInlineSnapshot(`
      [
        149,
        185,
        206,
        0,
        134,
        173,
        197,
        169,
        116,
        159,
        187,
        198,
        63,
        127,
        166,
        255,
        63,
        127,
        166,
        255,
        149,
        185,
        206,
        0,
      ]
    `);
  });

  it('keeps empty cells fully transparent and grows alpha with the value', () => {
    const rgba = gridToRgba(Float32Array.from([0, 0.5, 1]), heatShades(singleHueRamp('#000000')));
    expect(rgba[3]).toBe(0);
    expect(rgba[7] ?? 0).toBeLessThan(rgba[11] ?? 0);
    expect(rgba[11]).toBe(255);
  });

  it('keeps one hue: every lit cell has the same channel order as the colour', () => {
    const rgba = gridToRgba(
      Float32Array.from([0.1, 0.4, 0.9]),
      heatShades(singleHueRamp('#3f7fa6')),
    );
    for (let cell = 0; cell < 3; cell += 1) {
      const [r = 0, g = 0, b = 0] = rgba.slice(cell * 4, cell * 4 + 3);
      expect(r).toBeLessThan(g);
      expect(g).toBeLessThan(b);
    }
  });
});

describe('normaliseHeat', () => {
  it('scales the most common cell to 1, so a share of 1 in 30 designs still reads', () => {
    const shares = Float32Array.from([0, 1 / 30, 1 / 60, 0]);
    expect(Array.from(normaliseHeat(shares))).toEqual([0, 1, 0.5, 0].map(Math.fround));
  });

  it('leaves an empty grid empty', () => {
    expect(Array.from(normaliseHeat([0, 0, 0]))).toEqual([0, 0, 0]);
  });
});

describe('a grid with one hot cell', () => {
  it('draws that cell in opaque water blue and leaves the rest transparent', () => {
    const shares = new Float32Array(9);
    shares[4] = 1 / 30;
    const rgba = gridToRgba(normaliseHeat(shares), heatShades(singleHueRamp('#3f7fa6')));
    expect(Array.from(rgba.slice(16, 20))).toEqual([63, 127, 166, 255]);
    const [red = 0, , blue = 0] = rgba.slice(16, 19);
    expect(blue - red).toBeGreaterThan(80);
    expect([0, 1, 2, 3, 5, 6, 7, 8].map((cell) => rgba[cell * 4 + 3])).toEqual(Array(8).fill(0));
  });
});

describe('normaliseHeat on shared paths', () => {
  it('makes the cell most designs share the full colour and opaque', () => {
    // 21 of 30 designs share one path cell; its neighbours carry 3 and 1 of 30.
    const shares = [21 / 30, 3 / 30, 1 / 30, 0];
    const normalised = normaliseHeat(shares);
    expect(normalised[0]).toBe(1);
    const rgba = gridToRgba(normalised, heatShades(singleHueRamp('#3f7fa6')));
    expect(Array.from(rgba.slice(0, 4))).toEqual([0x3f, 0x7f, 0xa6, 255]);
    expect(rgba[15]).toBe(0);
  });
});

describe('upsampleHeat', () => {
  it('interpolates between cell centres and keeps the peak at its cell', () => {
    // A 2 by 1 grid at 4 texels per cell: 8 by 4 texels.
    const texels = upsampleHeat({ values: [1, 0], width: 2, height: 1 }, 4);
    expect(texels.width).toBe(8);
    expect(texels.height).toBe(4);
    const row = Array.from(texels.values.slice(0, 8));
    expect(Math.max(...row)).toBeCloseTo(1, 5);
    expect(row[0]).toBeCloseTo(1, 5);
    expect(row[7]).toBeCloseTo(0, 5);
    // Values fall steadily from the hot cell to the empty one, with no step.
    for (let i = 1; i < row.length; i += 1)
      expect(row[i] ?? 0).toBeLessThanOrEqual(row[i - 1] ?? 0);
    expect(new Set(row.map((value) => value.toFixed(3))).size).toBeGreaterThan(2);
  });
});

describe('heatTexture', () => {
  it('keeps the peak opaque, lifts rare cells and fades edges to clear', () => {
    const texture = heatTexture(
      { values: [0, 1 / 30, 21 / 30, 0], width: 4, height: 1 },
      heatShades(singleHueRamp('#3f7fa6')),
    );
    expect(texture.width).toBe(20);
    const alpha = (texel: number) => texture.data[texel * 4 + 3] ?? 0;
    // The busiest cell's centre texels are the full colour and fully opaque.
    expect(Math.max(...Array.from({ length: 20 }, (_, t) => alpha(t)))).toBe(255);
    // A cell 1 in 21 as busy as the peak still reads, at more than a linear 1/21 of the colour.
    expect(alpha(7)).toBeGreaterThan(0);
    // Empty cells far from any path stay clear, and alpha steps down gradually toward them.
    expect(alpha(0)).toBe(0);
    expect(alpha(19)).toBe(0);
    expect(alpha(1)).toBeLessThan(alpha(3));
  });
});

describe('the ramp in linear light', () => {
  const ramp = singleHueRamp('#3f7fa6');

  it('maps the busiest cell to the top colour of the ramp, fully opaque', () => {
    const summed = [2, 9, 21, 0];
    const rgba = gridToRgba(normaliseHeat(summed), heatShades(ramp));
    expect(Array.from(rgba.slice(8, 12))).toEqual([...ramp.high, 255]);
  });

  it('blends the two ends in linear light, then encodes the result as sRGB', () => {
    const [low, high] = [linearRgb('#95b9ce'), linearRgb('#3f7fa6')];
    const middle = rampLinear(ramp, 0.5);
    middle.forEach((channel, index) => {
      expect(channel).toBeCloseTo(((low[index] ?? 0) + (high[index] ?? 0)) / 2, 2);
    });
    const shades = heatShades(ramp);
    const mid = Array.from(shades.slice(128 * 3, 128 * 3 + 3));
    expect(mid).toEqual(rampLinear(ramp, 128 / 255).map(srgbByte));
    // Linear-light blending sits brighter than the byte average of the two ends.
    expect(mid[0]).toBeGreaterThan((149 + 63) / 2);
  });

  it('undoes the ACES curve when asked, so the screen shows the top colour', () => {
    const exposure = 1.1;
    const shades = heatShades(ramp, (linear) => inverseAcesFilmic(linear, exposure));
    const top = Array.from(shades.slice(255 * 3, 256 * 3));
    const onScreen = acesFilmic(linearRgb(hex(top)), exposure).map(srgbByte);
    onScreen.forEach((channel, index) => {
      expect(Math.abs(channel - (ramp.high[index] ?? 0))).toBeLessThanOrEqual(2);
    });
  });

  it('keeps the busiest cell at least mid-strength over the lawn at 80 percent opacity', () => {
    const exposure = 1.1;
    const undo = (linear: readonly [number, number, number]) => inverseAcesFilmic(linear, exposure);
    const shades = heatShades(ramp, undo);
    const top = linearRgb(hex(Array.from(shades.slice(255 * 3, 256 * 3))));
    const lawnScreen = [135, 168, 115];
    const lawn = undo(linearRgb(hex(lawnScreen)));
    // With the composer on, blending happens in linear light before the ACES pass.
    const blended = top.map((channel, index) => 0.8 * channel + 0.2 * (lawn[index] ?? 0));
    const onScreen = acesFilmic(blended as [number, number, number], exposure).map(srgbByte);
    const toward = ramp.high.map((channel, index) => channel - (lawnScreen[index] ?? 0));
    const moved = onScreen.map((channel, index) => channel - (lawnScreen[index] ?? 0));
    const dot = (a: readonly number[], b: readonly number[]) =>
      a.reduce((sum, value, index) => sum + value * (b[index] ?? 0), 0);
    expect(dot(moved, toward) / dot(toward, toward)).toBeGreaterThanOrEqual(0.5);
  });
});

function hex(bytes: readonly number[]): string {
  return `#${bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}
