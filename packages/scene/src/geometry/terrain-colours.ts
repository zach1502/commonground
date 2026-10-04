import type { Heightmap } from '@parkshape/core';

import type { ScenePalette } from '../palette/colours.js';
import type { GroundPoint } from '../types.js';

import { valueAt } from './arrays.js';
import { nodeCoordinates, nodePoint } from './grid.js';
import { isInsidePolygon } from './polygon.js';
import { gridNormal, skirtRingSize, type TerrainArrays } from './terrain-mesh.js';
import { TOP_AND_BOTTOM, VECTOR_SIZE, Z_OFFSET } from './vector-layout.js';

// DESIGN.md "Ground": grass under 8 percent, a blend to meadow up to 20, soil above that.
const GRASS_LIMIT = 0.08;
const MEADOW_LIMIT = 0.2;
const HEX_RADIX = 16;
const BYTE = 255;
const HEX_CHANNEL_CHARS = 2;
const RED = 0;
const GREEN = 1;
const BLUE = 2;
// The sRGB transfer function, as IEC 61966-2-1 defines it.
const SRGB_KNEE = 0.04045;
const SRGB_LINEAR_SLOPE = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_GAMMA = 2.4;

export type Rgb = readonly [number, number, number];

/** Linear-light RGB of an sRGB hex colour, the space three.js vertex colours use. */
export function linearRgb(hex: string): Rgb {
  const digits = hex.replace('#', '');
  const channel = (index: number): number => {
    const start = index * HEX_CHANNEL_CHARS;
    const value = Number.parseInt(digits.slice(start, start + HEX_CHANNEL_CHARS), HEX_RADIX) / BYTE;
    return value <= SRGB_KNEE
      ? value / SRGB_LINEAR_SLOPE
      : ((value + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_GAMMA;
  };
  return [channel(RED), channel(GREEN), channel(BLUE)];
}

/** The sRGB byte, 0 to 255, for one linear-light channel. */
export function srgbByte(linear: number): number {
  const value = Math.min(Math.max(linear, 0), 1);
  const encoded =
    value <= SRGB_KNEE / SRGB_LINEAR_SLOPE
      ? value * SRGB_LINEAR_SLOPE
      : SRGB_SCALE * value ** (1 / SRGB_GAMMA) - SRGB_OFFSET;
  return Math.round(encoded * BYTE);
}

export interface SlopeWeights {
  readonly grass: number;
  readonly meadow: number;
  readonly soil: number;
}

/** How much of each ground colour a vertex gets at a slope, given as rise over run. */
export function slopeBlend(slope: number): SlopeWeights {
  if (slope <= GRASS_LIMIT) return { grass: 1, meadow: 0, soil: 0 };
  if (slope > MEADOW_LIMIT) return { grass: 0, meadow: 0, soil: 1 };
  const meadow = (slope - GRASS_LIMIT) / (MEADOW_LIMIT - GRASS_LIMIT);
  return { grass: 1 - meadow, meadow, soil: 0 };
}

function mix(weights: SlopeWeights, colours: Readonly<Record<keyof SlopeWeights, Rgb>>): Rgb {
  const at = (k: typeof RED | typeof GREEN | typeof BLUE) =>
    weights.grass * colours.grass[k] +
    weights.meadow * colours.meadow[k] +
    weights.soil * colours.soil[k];
  return [at(RED), at(GREEN), at(BLUE)];
}

export interface TerrainColourOptions {
  /** Garden bed outlines, drawn in soilDark. */
  readonly beds: readonly (readonly GroundPoint[])[];
  /** The mesh the colours are for, when it is cut to an outline rather than the grid box. */
  readonly mesh?: Pick<TerrainArrays, 'positions' | 'surfaceVertexCount'>;
}

type Ground = Readonly<Record<keyof SlopeWeights, Rgb>>;

function groundColour(
  heightmap: Heightmap,
  point: GroundPoint,
  options: TerrainColourOptions,
  ground: Ground & { readonly bed: Rgb },
): Rgb {
  if (options.beds.some((outline) => isInsidePolygon(outline, point))) return ground.bed;
  const { u, v } = nodeCoordinates(heightmap, point);
  const i = Math.min(Math.max(Math.round(u), 0), heightmap.width - 1);
  const j = Math.min(Math.max(Math.round(v), 0), heightmap.height - 1);
  const [nx, ny, nz] = gridNormal(heightmap, i, j);
  return mix(slopeBlend(Math.hypot(nx, nz) / ny), ground);
}

type Palette = Ground & { readonly bed: Rgb };

/** Colours the vertices the outline cut added after the grid, the same way as the grid. */
function colourCutVertices(
  heightmap: Heightmap,
  options: TerrainColourOptions,
  ground: Palette,
  colours: Float32Array,
): void {
  const { mesh } = options;
  if (mesh === undefined) return;
  for (let v = heightmap.width * heightmap.height; v < mesh.surfaceVertexCount; v += 1) {
    const point = {
      x: valueAt(mesh.positions, v * VECTOR_SIZE),
      z: valueAt(mesh.positions, v * VECTOR_SIZE + Z_OFFSET),
    };
    colours.set(groundColour(heightmap, point, options, ground), v * VECTOR_SIZE);
  }
}

/**
 * A linear RGB colour per terrain mesh vertex: the grid by slope and garden beds, then any cut
 * vertices on the outline the same way, then the skirt in soilDark, in the order the ground mesh
 * writes the vertices.
 */
export function terrainColours(
  heightmap: Heightmap,
  palette: ScenePalette,
  options: TerrainColourOptions,
): Float32Array {
  const { width, height } = heightmap;
  const gridCount = width * height;
  const boxCount = (gridCount + TOP_AND_BOTTOM * skirtRingSize(heightmap)) * VECTOR_SIZE;
  const colours = new Float32Array(options.mesh?.positions.length ?? boxCount);
  const ground: Palette = {
    grass: linearRgb(palette.terrainGrass),
    meadow: linearRgb(palette.terrainMeadow),
    soil: linearRgb(palette.soil),
    bed: linearRgb(palette.soilDark),
  };
  for (let index = 0; index < gridCount; index += 1) {
    const point = nodePoint(heightmap, index % width, Math.floor(index / width));
    colours.set(groundColour(heightmap, point, options, ground), index * VECTOR_SIZE);
  }
  colourCutVertices(heightmap, options, ground, colours);
  const surfaceEnd = options.mesh?.surfaceVertexCount ?? gridCount;
  for (let v = surfaceEnd; v < colours.length / VECTOR_SIZE; v += 1) {
    colours.set(ground.bed, v * VECTOR_SIZE);
  }
  return colours;
}
