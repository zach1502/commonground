import { clamp } from '@parkshape/core';

import { gridToRgba, normaliseHeat } from './heat-ramp.js';

/** Values on a grid, row by row from the south-west corner. */
export interface HeatTexels {
  readonly values: ArrayLike<number>;
  readonly width: number;
  readonly height: number;
}

// Where a texel centre falls in cell units, measured from the first cell centre.
const CENTRE = 0.5;

function sampleAt(grid: HeatTexels, u: number, v: number): number {
  const x = clamp(u, 0, grid.width - 1);
  const y = clamp(v, 0, grid.height - 1);
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(x0 + 1, grid.width - 1);
  const y1 = Math.min(y0 + 1, grid.height - 1);
  const at = (i: number, j: number) => grid.values[j * grid.width + i] ?? 0;
  const fx = x - x0;
  const fy = y - y0;
  const south = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * fx;
  const north = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * fx;
  return south + (north - south) * fy;
}

/**
 * The grid at `factor` texels per cell, interpolated between cell centres. One texel per 1 m
 * cell draws each cell as a square, and a diagonal path as stairs; the finer texture draws the
 * same data as smooth bands. Each cell centre keeps its own value, so the peak stays 1.
 */
export function upsampleHeat(
  grid: HeatTexels,
  factor: number,
): HeatTexels & { readonly values: Float32Array } {
  const width = grid.width * factor;
  const height = grid.height * factor;
  const values = new Float32Array(width * height);
  for (let j = 0; j < height; j += 1) {
    const v = (j + CENTRE) / factor - CENTRE;
    for (let i = 0; i < width; i += 1) {
      values[j * width + i] = sampleAt(grid, (i + CENTRE) / factor - CENTRE, v);
    }
  }
  return { values, width, height };
}

/** Texels per 1 m cell. Odd, so one texel sits on each cell centre and keeps its exact value. */
export const TEXELS_PER_CELL = 5;
const RGBA_SIZE = 4;
const ALPHA_OFFSET = 3;
// A square root spreads the low shares, so a path 3 of 30 designs drew reads as more than pale.
const PERCEPTUAL_POWER = 0.5;

/**
 * The RGBA texture for a heat grid, coloured from `heatShades`: shares scaled so the busiest cell is 1 and fully opaque,
 * a square-root curve so shared paths read strongly, 5 texels per cell interpolated between
 * cell centres, and alpha that fades to clear at the edge of the covered cells instead of a
 * 1 m stair step.
 */
export function heatTexture(
  grid: HeatTexels,
  shades: Uint8Array,
): { readonly data: Uint8Array; readonly width: number; readonly height: number } {
  const shaped = normaliseHeat(grid.values).map((value) => value ** PERCEPTUAL_POWER);
  const coverage = Float32Array.from(shaped, (value) => (value > 0 ? 1 : 0));
  const texels = upsampleHeat({ ...grid, values: shaped }, TEXELS_PER_CELL);
  const edges = upsampleHeat({ ...grid, values: coverage }, TEXELS_PER_CELL);
  const data = gridToRgba(texels.values, shades);
  edges.values.forEach((cover, texel) => {
    const offset = texel * RGBA_SIZE + ALPHA_OFFSET;
    data[offset] = Math.round((data[offset] ?? 0) * cover);
  });
  return { data, width: texels.width, height: texels.height };
}
