import type { Heightmap, Random } from '@parkshape/core';

import type { GroundPoint, MeshArrays, Vector3 } from '../types.js';

import { itemAt, valueAt } from './arrays.js';
import { isInsidePolygon, triangulate } from './polygon.js';
import { elevationAt } from './sample.js';
import { HALF, symmetric, VECTOR_SIZE } from './vector-layout.js';

type Outline = readonly GroundPoint[];

// Keeps area fills just above the terrain so they do not flicker against it.
const DEFAULT_AREA_LIFT_M = 0.02;
// Absorbs rounding when a spacing divides the perimeter exactly.
const SPACING_TOLERANCE = 1e-9;

/** Area outline as a flat-shaded ground mesh whose corners sit on the terrain. */
export function buildAreaMesh(
  heightmap: Heightmap,
  outline: Outline,
  options: { readonly liftM?: number },
): MeshArrays {
  const lift = options.liftM ?? DEFAULT_AREA_LIFT_M;
  const positions = new Float32Array(outline.length * VECTOR_SIZE);
  const normals = new Float32Array(positions.length);
  outline.forEach((point, index) => {
    positions.set([point.x, elevationAt(heightmap, point) + lift, point.z], index * VECTOR_SIZE);
    normals.set([0, 1, 0], index * VECTOR_SIZE);
  });
  return { positions, normals, indices: Uint32Array.from(triangulate(outline)) };
}

export interface PanelTransform {
  readonly position: Vector3;
  readonly rotationY: number;
}

/** Fence or hedge along an outline: posts at even spacing and a panel between each pair. */
export interface Perimeter {
  readonly posts: readonly Vector3[];
  readonly panels: readonly PanelTransform[];
  readonly panelLengthM: number;
}

function edgeLengths(outline: Outline): number[] {
  return outline.map((point, index) => {
    const next = itemAt(outline, index + 1);
    return Math.hypot(next.x - point.x, next.z - point.z);
  });
}

function pointAlong(outline: Outline, lengths: readonly number[], distance: number): GroundPoint {
  let left = distance;
  let edge = 0;
  while (edge < lengths.length - 1 && left > valueAt(lengths, edge)) {
    left -= valueAt(lengths, edge);
    edge += 1;
  }
  const from = itemAt(outline, edge);
  const to = itemAt(outline, edge + 1);
  const length = valueAt(lengths, edge);
  const t = length === 0 ? 0 : left / length;
  return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t };
}

function draped(heightmap: Heightmap, point: GroundPoint): Vector3 {
  return { x: point.x, y: elevationAt(heightmap, point), z: point.z };
}

/** Samples the closed outline at the nearest spacing that divides its perimeter evenly. */
export function samplePerimeter(
  heightmap: Heightmap,
  outline: Outline,
  spacingM: number,
): Perimeter {
  const lengths = edgeLengths(outline);
  const total = lengths.reduce((sum, length) => sum + length, 0);
  const count = Math.max(Math.ceil(total / spacingM - SPACING_TOLERANCE), 1);
  const step = total / count;
  const ground = Array.from({ length: count }, (_, k) => pointAlong(outline, lengths, k * step));
  const panels = ground.map((from, k): PanelTransform => {
    const to = itemAt(ground, k + 1);
    const middle = { x: (from.x + to.x) * HALF, z: (from.z + to.z) * HALF };
    // Adding zero turns -0 into 0 for edges that run along +x.
    return {
      position: draped(heightmap, middle),
      rotationY: Math.atan2(from.z - to.z, to.x - from.x) + 0,
    };
  });
  return { posts: ground.map((point) => draped(heightmap, point)), panels, panelLengthM: step };
}

/** Index of the panel whose centre is closest to a point, where a gate replaces it. */
export function nearestPanelIndex(panels: readonly PanelTransform[], point: GroundPoint): number {
  let best = -1;
  let bestDistance = Infinity;
  panels.forEach((panel, index) => {
    const distance = Math.hypot(panel.position.x - point.x, panel.position.z - point.z);
    if (distance < bestDistance) {
      best = index;
      bestDistance = distance;
    }
  });
  return best;
}

export interface ModuleGrid {
  readonly widthM: number;
  readonly depthM: number;
  readonly aisleM: number;
  /** Largest random shift of each module; capped at half an aisle so modules never touch. */
  readonly jitterM: number;
}

function footprintFits(outline: Outline, centre: GroundPoint, grid: ModuleGrid): boolean {
  const halfW = grid.widthM * HALF;
  const halfD = grid.depthM * HALF;
  const corners = [
    { x: centre.x - halfW, z: centre.z - halfD },
    { x: centre.x + halfW, z: centre.z - halfD },
    { x: centre.x + halfW, z: centre.z + halfD },
    { x: centre.x - halfW, z: centre.z + halfD },
  ];
  const cornersInside = corners.every((corner) => isInsidePolygon(outline, corner));
  const vertexInside = outline.some(
    (vertex) => Math.abs(vertex.x - centre.x) < halfW && Math.abs(vertex.z - centre.z) < halfD,
  );
  return cornersInside && !vertexInside;
}

function gridStops(min: number, max: number, size: number, aisle: number): number[] {
  const stops: number[] = [];
  for (
    let centre = min + aisle + size * HALF;
    centre + size * HALF <= max;
    centre += size + aisle
  ) {
    stops.push(centre);
  }
  return stops;
}

/** Centres of modules such as garden plots laid in rows with aisles, inside an outline. */
export function fillModules(outline: Outline, grid: ModuleGrid, random: Random): GroundPoint[] {
  const xs = outline.map((point) => point.x);
  const zs = outline.map((point) => point.z);
  const columns = gridStops(Math.min(...xs), Math.max(...xs), grid.widthM, grid.aisleM);
  const rows = gridStops(Math.min(...zs), Math.max(...zs), grid.depthM, grid.aisleM);
  const jitter = Math.min(grid.jitterM, grid.aisleM * HALF);
  const shift = (): number => symmetric(random.next()) * jitter;
  return rows
    .flatMap((z) => columns.map((x) => ({ x, z })))
    .filter((centre) => footprintFits(outline, centre, grid))
    .map((centre) => ({ x: centre.x + shift(), z: centre.z + shift() }));
}
