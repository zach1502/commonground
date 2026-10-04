import type { Heightmap } from '@parkshape/core';

import type { GroundPoint, MeshArrays, Vector3 } from '../types.js';

import { itemAt } from './arrays.js';
import { nodePoint } from './grid.js';
import { polygonArea } from './measure.js';
import { isInsidePolygon } from './polygon.js';
import { elevationAt } from './sample.js';
import { FULL_TURN, VECTOR_SIZE } from './vector-layout.js';

type Outline = readonly GroundPoint[];

// Shoelace centroid: each coordinate sum is divided by six times the signed area.
const CENTROID_DIVISOR = 6;
const DEFAULT_SEGMENTS = 32;
// Pond surface sits a little above the lowest ground so the bed does not poke through.
const DEFAULT_LEVEL_ABOVE_MIN_M = 0.2;

export interface WaterOptions {
  readonly segments?: number;
  readonly levelAboveMinM?: number;
}

export interface WaterDisc {
  readonly centre: Vector3;
  readonly radiusM: number;
  readonly mesh: MeshArrays;
}

function gridPointsInside(heightmap: Heightmap, outline: Outline): GroundPoint[] {
  const points: GroundPoint[] = [];
  for (let j = 0; j < heightmap.height; j += 1) {
    for (let i = 0; i < heightmap.width; i += 1) {
      const point = nodePoint(heightmap, i, j);
      if (isInsidePolygon(outline, point)) points.push(point);
    }
  }
  return points;
}

function centroid(outline: Outline): GroundPoint {
  const area = polygonArea(outline);
  let x = 0;
  let z = 0;
  outline.forEach((point, index) => {
    const next = itemAt(outline, index + 1);
    const cross = next.x * point.z - point.x * next.z;
    x += (point.x + next.x) * cross;
    z += (point.z + next.z) * cross;
  });
  return { x: x / (CENTROID_DIVISOR * area), z: z / (CENTROID_DIVISOR * area) };
}

function distanceToSegment(point: GroundPoint, from: GroundPoint, to: GroundPoint): number {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const lengthSquared = dx * dx + dz * dz;
  const t =
    lengthSquared === 0
      ? 0
      : Math.min(
          Math.max(((point.x - from.x) * dx + (point.z - from.z) * dz) / lengthSquared, 0),
          1,
        );
  return Math.hypot(point.x - (from.x + t * dx), point.z - (from.z + t * dz));
}

function distanceToOutline(outline: Outline, point: GroundPoint): number {
  return outline.reduce(
    (nearest, from, index) =>
      Math.min(nearest, distanceToSegment(point, from, itemAt(outline, index + 1))),
    Infinity,
  );
}

function lowestPoint(heightmap: Heightmap, outline: Outline): GroundPoint {
  const candidates = gridPointsInside(heightmap, outline);
  if (candidates.length === 0) {
    return centroid(outline);
  }
  return candidates.reduce((low, point) =>
    elevationAt(heightmap, point) < elevationAt(heightmap, low) ? point : low,
  );
}

function fan(centre: Vector3, radiusM: number, segments: number): MeshArrays {
  const positions = new Float32Array((segments + 1) * VECTOR_SIZE);
  const normals = new Float32Array(positions.length);
  positions.set([centre.x, centre.y, centre.z], 0);
  normals.set([0, 1, 0], 0);
  const indices = new Uint32Array(segments * VECTOR_SIZE);
  for (let k = 0; k < segments; k += 1) {
    const angle = (k / segments) * FULL_TURN;
    const rim = [
      centre.x + radiusM * Math.cos(angle),
      centre.y,
      centre.z + radiusM * Math.sin(angle),
    ];
    positions.set(rim, (k + 1) * VECTOR_SIZE);
    normals.set([0, 1, 0], (k + 1) * VECTOR_SIZE);
    indices.set([0, ((k + 1) % segments) + 1, k + 1], k * VECTOR_SIZE);
  }
  return { positions, normals, indices };
}

/** Flat pond disc at the lowest ground inside an outline, as wide as the outline allows. */
export function buildWaterDisc(
  heightmap: Heightmap,
  outline: Outline,
  options: WaterOptions,
): WaterDisc {
  const low = lowestPoint(heightmap, outline);
  const level = options.levelAboveMinM ?? DEFAULT_LEVEL_ABOVE_MIN_M;
  const centre = { x: low.x, y: elevationAt(heightmap, low) + level, z: low.z };
  const radiusM = distanceToOutline(outline, low);
  return { centre, radiusM, mesh: fan(centre, radiusM, options.segments ?? DEFAULT_SEGMENTS) };
}

export interface UvOffset {
  readonly x: number;
  readonly y: number;
}

// DESIGN.md "Ground, paths and water": 2 normal maps scroll at 0.02 and 0.013 UV per second in
// opposite directions, at a slant so the ripples do not line up with the parcel edges.
const FIRST_WAVE_UV_PER_S = 0.02;
const SECOND_WAVE_UV_PER_S = 0.013;
const WAVE_SPEEDS = [FIRST_WAVE_UV_PER_S, SECOND_WAVE_UV_PER_S] as const;
const WAVE_HEADING_RAD = 0.5;

/** How far each water normal map has scrolled after a time; 'still' keeps both at 0. */
export function waterOffsets(elapsedS: number, motion: 'animated' | 'still'): UvOffset[] {
  return WAVE_SPEEDS.map((speed, index) => {
    if (motion === 'still') return { x: 0, y: 0 };
    const heading = WAVE_HEADING_RAD + index * Math.PI;
    return {
      x: Math.cos(heading) * speed * elapsedS,
      y: Math.sin(heading) * speed * elapsedS,
    };
  });
}

// Whole wave counts across the tile, so the map repeats without a seam.
const WAVES = [
  { i: 3, j: 1, amplitude: 0.35 },
  { i: -2, j: 4, amplitude: 0.25 },
  { i: 5, j: -3, amplitude: 0.15 },
] as const;
const RGBA = 4;
const OPAQUE = 255;
const BYTE_HALF = 127.5;

/**
 * A tileable ripple normal map as RGBA bytes, built from a few sine waves: the water needs no
 * download, and the same bytes come out on every machine.
 */
export function waterNormalTexels(size: number): Uint8Array {
  const texels = new Uint8Array(size * size * RGBA);
  for (let j = 0; j < size; j += 1) {
    for (let i = 0; i < size; i += 1) {
      let dx = 0;
      let dy = 0;
      WAVES.forEach((wave) => {
        const phase = (FULL_TURN * (wave.i * i + wave.j * j)) / size;
        const slope = wave.amplitude * Math.cos(phase);
        dx += slope * wave.i;
        dy += slope * wave.j;
      });
      const scale = 1 / size;
      const nx = -dx * FULL_TURN * scale;
      const ny = -dy * FULL_TURN * scale;
      const length = Math.hypot(nx, ny, 1);
      texels.set(
        [
          (nx / length + 1) * BYTE_HALF,
          (ny / length + 1) * BYTE_HALF,
          (1 / length + 1) * BYTE_HALF,
          OPAQUE,
        ],
        (j * size + i) * RGBA,
      );
    }
  }
  return texels;
}
