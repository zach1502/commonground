import { clamp } from '@parkshape/core';

import { linearRgb, srgbByte } from '../geometry/terrain-colours.js';

type Rgb = readonly [number, number, number];

/** Two shades of one hue in sRGB bytes: a light tint for rare cells and the full colour. */
export interface HeatRamp {
  readonly low: Rgb;
  readonly high: Rgb;
}

/**
 * Turns the linear colour a pixel should show into the linear colour to store, such as the
 * inverse of the ACES curve the renderer applies afterwards. The identity stores it as is.
 */
export type ToneUndo = (linear: Rgb) => Rgb;

const HEX_COLOUR = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i;
const HEX_RADIX = 16;
const HEX_DIGITS = 2;
const CHANNEL_MAX = 255;
const RGB_SIZE = 3;
const RGBA_SIZE = 4;
const ALPHA_OFFSET = 3;
/** One shade per byte value, so the ramp is as smooth as the texture can store. */
const SHADE_STEPS = 256;
// How far toward white the low end sits; light enough to read as rarer, dark enough to show on grass.
const TINT_SHARE = 0.45;
// A cell one design touched still stands out from the terrain.
const MIN_ALPHA = 0.55;

const asIs: ToneUndo = (linear) => linear;

/** A ramp from a tint of the colour to the colour; one hue, never a rainbow. */
export function singleHueRamp(hex: string): HeatRamp {
  const match = HEX_COLOUR.exec(hex.trim());
  if (match === null) throw new RangeError(`Expected a #rrggbb colour, got ${hex}`);
  const high = [match[1], match[2], match[3]].map((part) => parseInt(part ?? '0', HEX_RADIX)) as [
    number,
    number,
    number,
  ];
  const tint = (channel: number) => Math.round(channel + (CHANNEL_MAX - channel) * TINT_SHARE);
  return { high, low: [tint(high[0]), tint(high[1]), tint(high[2])] };
}

const hexOf = (bytes: Rgb): string =>
  `#${bytes.map((byte) => byte.toString(HEX_RADIX).padStart(HEX_DIGITS, '0')).join('')}`;

/** The ramp colour at a value from 0 to 1, blended between its ends in linear light. */
export function rampLinear(ramp: HeatRamp, value: number): Rgb {
  const low = linearRgb(hexOf(ramp.low));
  const high = linearRgb(hexOf(ramp.high));
  const t = clamp(value, 0, 1);
  return [
    low[0] + (high[0] - low[0]) * t,
    low[1] + (high[1] - low[1]) * t,
    low[2] + (high[2] - low[2]) * t,
  ];
}

/**
 * sRGB bytes, 3 per step, for 256 steps along the ramp. Each step is blended in linear light,
 * passed through `undo` and encoded as sRGB, which is how three.js reads the texture back.
 */
export function heatShades(ramp: HeatRamp, undo: ToneUndo = asIs): Uint8Array {
  const shades = new Uint8Array(SHADE_STEPS * RGB_SIZE);
  for (let step = 0; step < SHADE_STEPS; step += 1) {
    const linear = undo(rampLinear(ramp, step / (SHADE_STEPS - 1)));
    shades.set(linear.map(srgbByte), step * RGB_SIZE);
  }
  return shades;
}

/**
 * Rescales summed counts or shares so the most common cell is 1. The API sends shares (0 to 1
 * of all designs), and a feature 1 in 30 designs placed would otherwise sit at the pale,
 * see-through end of the ramp.
 */
export function normaliseHeat(values: ArrayLike<number>): Float32Array {
  const scaled = Float32Array.from(values);
  const peak = scaled.reduce((highest, value) => Math.max(highest, value), 0);
  if (peak > 0) scaled.forEach((value, index) => (scaled[index] = value / peak));
  return scaled;
}

/**
 * RGBA bytes for a normalised grid, one pixel per cell in the same order. Empty cells are fully
 * transparent; alpha and depth of colour grow with the value, and 1 is the top shade, opaque.
 */
export function gridToRgba(values: ArrayLike<number>, shades: Uint8Array): Uint8Array {
  const rgba = new Uint8Array(values.length * RGBA_SIZE);
  for (let cell = 0; cell < values.length; cell += 1) {
    const value = clamp(values[cell] ?? 0, 0, 1);
    const offset = cell * RGBA_SIZE;
    const shade = Math.round(value * (SHADE_STEPS - 1)) * RGB_SIZE;
    rgba.set(shades.subarray(shade, shade + RGB_SIZE), offset);
    const alpha = value === 0 ? 0 : MIN_ALPHA + (1 - MIN_ALPHA) * value;
    rgba[offset + ALPHA_OFFSET] = Math.round(alpha * CHANNEL_MAX);
  }
  return rgba;
}
