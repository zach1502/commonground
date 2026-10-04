import { clamp, type Heightmap } from '@parkshape/core';

import type { MeshArrays } from '../types.js';

import { valueAt } from './arrays.js';
import { nodePoint } from './grid.js';
import { lowestElevation } from './sample.js';
import { HALF, TOP_AND_BOTTOM, VECTOR_SIZE, Y_OFFSET, Z_OFFSET } from './vector-layout.js';

const QUAD_INDICES = 6;
/** How far the island's skirt drops below the lowest ground, for the floating-island look. */
export const ISLAND_SKIRT_DEPTH_M = 1.5;

/** The terrain arrays with where the top surface ends and the skirt begins. */
export interface TerrainArrays extends MeshArrays {
  /** Vertices of the top surface; the skirt's vertices follow them. */
  readonly surfaceVertexCount: number;
  /** Indices of the top surface; the skirt's triangles follow them. */
  readonly surfaceIndexCount: number;
}

export interface TerrainMeshOptions {
  /** How far the skirt drops below the lowest grid point, for the floating-island look. */
  readonly skirtDepthM: number;
}

/** Number of vertices on the outer edge of the grid. */
export function skirtRingSize(heightmap: Heightmap): number {
  return perimeterIndices(heightmap).length;
}

/** Index count of the top surface; the skirt triangles follow it in the index buffer. */
export function surfaceIndexCount(heightmap: Heightmap): number {
  return (heightmap.width - 1) * (heightmap.height - 1) * QUAD_INDICES;
}

/** Grid indices of the perimeter, walking +x along row 0, then +z, then -x, then -z. */
function perimeterIndices(heightmap: Heightmap): number[] {
  const { width, height } = heightmap;
  const ring: number[] = [];
  const lastColumn = width - 1;
  const lastRow = height - 1;
  for (let i = 0; i < width; i += 1) ring.push(i);
  for (let j = 1; j < height; j += 1) ring.push(j * width + lastColumn);
  for (let i = lastColumn - 1; i >= 0; i -= 1) ring.push(lastRow * width + i);
  for (let j = lastRow - 1; j > 0; j -= 1) ring.push(j * width);
  return ring;
}

export function gridNormal(heightmap: Heightmap, i: number, j: number): [number, number, number] {
  const { width, height, resolutionM, elevations } = heightmap;
  const at = (ci: number, cj: number): number =>
    valueAt(elevations, clamp(cj, 0, height - 1) * width + clamp(ci, 0, width - 1));
  const slopeX = ((at(i + 1, j) - at(i - 1, j)) * HALF) / resolutionM;
  const slopeZ = ((at(i, j + 1) - at(i, j - 1)) * HALF) / resolutionM;
  const length = Math.hypot(slopeX, 1, slopeZ);
  return [-slopeX / length, 1 / length, -slopeZ / length];
}

/** Writes every grid node as a vertex, in grid order, with its normal. */
export function writeGrid(
  heightmap: Heightmap,
  positions: Float32Array,
  normals: Float32Array,
): void {
  const { width, height, elevations } = heightmap;
  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      const index = j * width + i;
      const { x, z } = nodePoint(heightmap, i, j);
      positions.set([x, valueAt(elevations, index), z], index * VECTOR_SIZE);
      normals.set(gridNormal(heightmap, i, j), index * VECTOR_SIZE);
    }
  }
}

/** Inclusive grid-index bounds of a rebuilt surface patch. */
export interface MeshRegion {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Rewrites only the surface vertices inside a region after the heightmap changed there. The
 * caller marks the position and normal attributes as needing an upload. Skirt vertices are left
 * alone, so a grade edit never touches the island's sides.
 */
export function writeGridRegion(
  heightmap: Heightmap,
  positions: Float32Array,
  normals: Float32Array,
  region: MeshRegion,
): void {
  const { width } = heightmap;
  for (let j = region.minY; j <= region.maxY; j += 1) {
    for (let i = region.minX; i <= region.maxX; i += 1) {
      const index = j * width + i;
      const { x, z } = nodePoint(heightmap, i, j);
      positions.set([x, valueAt(heightmap.elevations, index), z], index * VECTOR_SIZE);
      normals.set(gridNormal(heightmap, i, j), index * VECTOR_SIZE);
    }
  }
}

/** Two triangles per grid quad over the top surface; returns how many indices it wrote. */
export function gridTriangles(heightmap: Heightmap, indices: Uint32Array): number {
  const { width, height } = heightmap;
  let cursor = 0;
  for (let j = 0; j < height - 1; j += 1) {
    for (let i = 0; i < width - 1; i += 1) {
      const a = j * width + i;
      const below = a + width;
      indices.set([a, below, a + 1, a + 1, below, below + 1], cursor);
      cursor += QUAD_INDICES;
    }
  }
  return cursor;
}

interface SkirtLayout {
  readonly ring: readonly number[];
  readonly topStart: number;
  readonly baseY: number;
  readonly centre: readonly [number, number];
}

function writeSkirtVertices(
  positions: Float32Array,
  normals: Float32Array,
  layout: SkirtLayout,
): void {
  const { ring, topStart, baseY, centre } = layout;
  ring.forEach((gridIndex, k) => {
    const x = valueAt(positions, gridIndex * VECTOR_SIZE);
    const y = valueAt(positions, gridIndex * VECTOR_SIZE + Y_OFFSET);
    const z = valueAt(positions, gridIndex * VECTOR_SIZE + Z_OFFSET);
    const length = Math.hypot(x - centre[0], z - centre[1]) || 1;
    const normal = [(x - centre[0]) / length, 0, (z - centre[1]) / length];
    const top = topStart + k;
    const bottom = topStart + ring.length + k;
    positions.set([x, y, z], top * VECTOR_SIZE);
    positions.set([x, baseY, z], bottom * VECTOR_SIZE);
    normals.set(normal, top * VECTOR_SIZE);
    normals.set(normal, bottom * VECTOR_SIZE);
  });
}

function skirtTriangles(indices: Uint32Array, cursor: number, layout: SkirtLayout): void {
  const size = layout.ring.length;
  for (let k = 0; k < size; k += 1) {
    const next = (k + 1) % size;
    const topA = layout.topStart + k;
    const topB = layout.topStart + next;
    const baseA = topA + size;
    const baseB = topB + size;
    indices.set([topA, topB, baseA, topB, baseB, baseA], cursor + k * QUAD_INDICES);
  }
}

function gridCentre(heightmap: Heightmap): [number, number] {
  const first = nodePoint(heightmap, 0, 0);
  const last = nodePoint(heightmap, heightmap.width - 1, heightmap.height - 1);
  return [(first.x + last.x) * HALF, (first.z + last.z) * HALF];
}

/** Terrain surface plus a vertical skirt that drops to a flat base under the island. */
export function buildTerrainMesh(heightmap: Heightmap, options: TerrainMeshOptions): TerrainArrays {
  const gridCount = heightmap.width * heightmap.height;
  const ring = perimeterIndices(heightmap);
  const vertexCount = gridCount + TOP_AND_BOTTOM * ring.length;
  const cellCount = (heightmap.width - 1) * (heightmap.height - 1);
  const positions = new Float32Array(vertexCount * VECTOR_SIZE);
  const normals = new Float32Array(vertexCount * VECTOR_SIZE);
  const indices = new Uint32Array((cellCount + ring.length) * QUAD_INDICES);
  writeGrid(heightmap, positions, normals);
  const layout: SkirtLayout = {
    ring,
    topStart: gridCount,
    baseY: lowestElevation(heightmap) - options.skirtDepthM,
    centre: gridCentre(heightmap),
  };
  writeSkirtVertices(positions, normals, layout);
  const surfaceIndices = gridTriangles(heightmap, indices);
  skirtTriangles(indices, surfaceIndices, layout);
  return {
    positions,
    normals,
    indices,
    surfaceVertexCount: gridCount,
    surfaceIndexCount: surfaceIndices,
  };
}
