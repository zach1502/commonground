import {
  clamp,
  CONTEXT_BUFFER_M,
  polygonContains,
  type Heightmap,
  type PlanePoint,
} from '@parkshape/core';

import type { GroundHeight } from '../camera/limits.js';
import { valueAt } from '../geometry/arrays.js';
import { elevationAt, heightmapBounds, type SceneBounds } from '../geometry/sample.js';
import { linearRgb } from '../geometry/terrain-colours.js';
import { HALF, VECTOR_SIZE } from '../geometry/vector-layout.js';
import type { ScenePalette } from '../palette/colours.js';
import type { GroundPoint, MeshArrays } from '../types.js';

/** How far the apron reaches past the parcel box: as far as the site context does. */
export const APRON_EXTENT_M = CONTEXT_BUFFER_M;
/** Inside this band the apron eases from the parcel edge height to the edge mean. */
export const APRON_BLEND_M = 60;
// Grid spacing inside the blend band, fine enough that the ribbons on it follow the ease.
const APRON_CELL_M = 2;
// The outer band whose vertex colour fades to the sky, so fog leaves no hard edge.
const APRON_FADE_M = 60;
// Half the step for the finite-difference normals.
const NORMAL_STEP_M = 0.5;
const EASE_SQUARE = 3;
/**
 * Around a parcel cut to its outline, the apron also fills the grid box outside the outline. It
 * sits this far under the ground there, so the island's edge and sides stay on top of it.
 */
export const APRON_UNDER_ISLAND_M = 0.15;

export interface ApronArrays extends MeshArrays {
  /** Linear RGB per vertex: the meadow green, fading to the sky at the outer edge. */
  readonly colours: Float32Array;
}

/** Mean height of the grid's outer ring of nodes: the flat apron's level. */
export function edgeMeanHeight(heightmap: Heightmap): number {
  const { width, height, elevations } = heightmap;
  const ring: number[] = [];
  for (let i = 0; i < width; i += 1) ring.push(i, (height - 1) * width + i);
  for (let j = 1; j < height - 1; j += 1) ring.push(j * width, j * width + width - 1);
  return ring.reduce((sum, index) => sum + valueAt(elevations, index), 0) / ring.length;
}

const smoothstep = (t: number) => t * t * (EASE_SQUARE - t - t);

function nearestEdge(bounds: SceneBounds, point: GroundPoint): GroundPoint {
  return {
    x: clamp(point.x, bounds.minX, bounds.maxX),
    z: clamp(point.z, bounds.minZ, bounds.maxZ),
  };
}

/**
 * Ground height of the apron: the terrain inside the parcel box, then from the nearest edge
 * cell's height easing to the edge mean over APRON_BLEND_M, then flat at the mean.
 */
export function apronElevation(heightmap: Heightmap): GroundHeight {
  const bounds = heightmapBounds(heightmap);
  const mean = edgeMeanHeight(heightmap);
  const drop = heightmap.groundOutline === undefined ? 0 : APRON_UNDER_ISLAND_M;
  const eased = (point: GroundPoint) => {
    const edge = nearestEdge(bounds, point);
    const distance = Math.hypot(point.x - edge.x, point.z - edge.z);
    if (distance === 0) return elevationAt(heightmap, point);
    if (distance >= APRON_BLEND_M) return mean;
    const edgeHeight = elevationAt(heightmap, edge);
    return edgeHeight + (mean - edgeHeight) * smoothstep(distance / APRON_BLEND_M);
  };
  return (point) => eased(point) - drop;
}

/** Grid lines along one axis: the outer fade, the blend band, the parcel side, and out again. */
function axisLines(min: number, max: number): number[] {
  const band = Math.round(APRON_BLEND_M / APRON_CELL_M);
  const before = Array.from({ length: band }, (_, k) => min - (band - k) * APRON_CELL_M);
  const after = Array.from({ length: band }, (_, k) => max + (k + 1) * APRON_CELL_M);
  const cells = Math.max(1, Math.ceil((max - min) / APRON_CELL_M));
  const side = Array.from({ length: cells + 1 }, (_, i) => min + ((max - min) * i) / cells);
  const outer = APRON_EXTENT_M - APRON_FADE_M;
  return [
    min - APRON_EXTENT_M,
    min - outer,
    ...before,
    ...side,
    ...after,
    max + outer,
    max + APRON_EXTENT_M,
  ];
}

function insideBox(bounds: SceneBounds, x: number, z: number): boolean {
  return x > bounds.minX && x < bounds.maxX && z > bounds.minZ && z < bounds.maxZ;
}

function fadeAt(bounds: SceneBounds, point: GroundPoint): number {
  const out = Math.max(
    bounds.minX - point.x,
    point.x - bounds.maxX,
    bounds.minZ - point.z,
    point.z - bounds.maxZ,
  );
  return clamp((out - (APRON_EXTENT_M - APRON_FADE_M)) / APRON_FADE_M, 0, 1);
}

function normalAt(ground: GroundHeight, point: GroundPoint): [number, number, number] {
  const slopeX =
    (ground({ x: point.x + NORMAL_STEP_M, z: point.z }) -
      ground({ x: point.x - NORMAL_STEP_M, z: point.z })) *
    (HALF / NORMAL_STEP_M);
  const slopeZ =
    (ground({ x: point.x, z: point.z + NORMAL_STEP_M }) -
      ground({ x: point.x, z: point.z - NORMAL_STEP_M })) *
    (HALF / NORMAL_STEP_M);
  const length = Math.hypot(slopeX, 1, slopeZ);
  return [-slopeX / length, 1 / length, -slopeZ / length];
}

interface ApronGrid {
  readonly xs: readonly number[];
  readonly zs: readonly number[];
  readonly bounds: SceneBounds;
  /** The parcel outline when the island is cut to it; the apron then fills the box around it. */
  readonly outline: readonly PlanePoint[] | undefined;
}

/** Whether a cell is left open for the island: inside the box, or wholly inside the outline. */
function isIslandCell(grid: ApronGrid, i: number, j: number): boolean {
  const { xs, zs, bounds, outline } = grid;
  if (outline === undefined) {
    const centreX = ((xs[i] ?? 0) + (xs[i + 1] ?? 0)) * HALF;
    const centreZ = ((zs[j] ?? 0) + (zs[j + 1] ?? 0)) * HALF;
    return insideBox(bounds, centreX, centreZ);
  }
  const corners = [0, 1].flatMap((dj) =>
    [0, 1].map((di) => ({ x: xs[i + di] ?? 0, z: zs[j + dj] ?? 0 })),
  );
  return corners.every((corner) => polygonContains(outline, { x: corner.x, y: corner.z }));
}

/** Index of each kept grid vertex in the output, or -1 inside the parcel box. */
function vertexSlots({ xs, zs, bounds, outline }: ApronGrid): { slots: Int32Array; count: number } {
  const slots = new Int32Array(xs.length * zs.length).fill(-1);
  let count = 0;
  zs.forEach((z, j) => {
    xs.forEach((x, i) => {
      if (outline !== undefined || !insideBox(bounds, x, z)) {
        slots[j * xs.length + i] = count;
        count += 1;
      }
    });
  });
  return { slots, count };
}

function cellIndices(grid: ApronGrid, slots: Int32Array): Uint32Array {
  const { xs, zs } = grid;
  const indices: number[] = [];
  for (let j = 0; j < zs.length - 1; j += 1) {
    for (let i = 0; i < xs.length - 1; i += 1) {
      if (isIslandCell(grid, i, j)) continue;
      const at = (di: number, dj: number) => valueAt(slots, (j + dj) * xs.length + i + di);
      indices.push(at(0, 0), at(0, 1), at(1, 0), at(1, 0), at(0, 1), at(1, 1));
    }
  }
  return Uint32Array.from(indices);
}

/**
 * The scene-only ground around the parcel, out to APRON_EXTENT_M, with no hole edge step. Around
 * an outline it also fills the grid box outside the outline, just under the island.
 */
export function buildApron(heightmap: Heightmap, palette: ScenePalette): ApronArrays {
  const bounds = heightmapBounds(heightmap);
  const ground = apronElevation(heightmap);
  const grid: ApronGrid = {
    xs: axisLines(bounds.minX, bounds.maxX),
    zs: axisLines(bounds.minZ, bounds.maxZ),
    bounds,
    outline: heightmap.groundOutline,
  };
  const { slots, count } = vertexSlots(grid);
  const positions = new Float32Array(count * VECTOR_SIZE);
  const normals = new Float32Array(count * VECTOR_SIZE);
  const colours = new Float32Array(count * VECTOR_SIZE);
  const meadow = linearRgb(palette.terrainMeadow);
  const sky = linearRgb(palette.sky);
  grid.zs.forEach((z, j) => {
    grid.xs.forEach((x, i) => {
      const slot = valueAt(slots, j * grid.xs.length + i);
      if (slot < 0) return;
      const point = { x, z };
      const fade = fadeAt(bounds, point);
      positions.set([x, ground(point), z], slot * VECTOR_SIZE);
      normals.set(normalAt(ground, point), slot * VECTOR_SIZE);
      colours.set(
        meadow.map((channel, k) => channel + ((sky[k] ?? channel) - channel) * fade),
        slot * VECTOR_SIZE,
      );
    });
  });
  return { positions, normals, indices: cellIndices(grid, slots), colours };
}
