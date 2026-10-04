import type { Heightmap } from '@parkshape/core';

import type { GroundPoint, Vector3 } from '../types.js';

import { valueAt } from './arrays.js';
import { nodeCoordinates, nodePoint } from './grid.js';

/** Axis-aligned box around a heightmap, in metres. */
export interface SceneBounds {
  readonly minX: number;
  readonly maxX: number;
  readonly minZ: number;
  readonly maxZ: number;
  readonly minY: number;
  readonly maxY: number;
}

function clampIndex(value: number, size: number): number {
  return Math.min(Math.max(value, 0), size - 1);
}

function gridValue(heightmap: Heightmap, i: number, j: number): number {
  return valueAt(heightmap.elevations, j * heightmap.width + i);
}

/** Bilinear elevation at a ground point; points off the grid take the nearest edge value. */
export function elevationAt(heightmap: Heightmap, point: GroundPoint): number {
  const node = nodeCoordinates(heightmap, point);
  const u = clampIndex(node.u, heightmap.width);
  const v = clampIndex(node.v, heightmap.height);
  // The last cell starts one before the last grid line.
  const i = Math.min(Math.floor(u), heightmap.width - 1 - 1);
  const j = Math.min(Math.floor(v), heightmap.height - 1 - 1);
  const fu = u - i;
  const fv = v - j;
  const top = gridValue(heightmap, i, j) * (1 - fu) + gridValue(heightmap, i + 1, j) * fu;
  const bottom =
    gridValue(heightmap, i, j + 1) * (1 - fu) + gridValue(heightmap, i + 1, j + 1) * fu;
  return top * (1 - fv) + bottom * fv;
}

/** Lowest elevation on the grid. */
export function lowestElevation(heightmap: Heightmap): number {
  return heightmap.elevations.reduce((low, value) => Math.min(low, value), Infinity);
}

export function heightmapBounds(heightmap: Heightmap): SceneBounds {
  const highest = heightmap.elevations.reduce((high, value) => Math.max(high, value), -Infinity);
  const first = nodePoint(heightmap, 0, 0);
  const last = nodePoint(heightmap, heightmap.width - 1, heightmap.height - 1);
  return {
    minX: first.x,
    maxX: last.x,
    minZ: first.z,
    maxZ: last.z,
    minY: lowestElevation(heightmap),
    maxY: highest,
  };
}

const HALF = 0.5;

/** Middle of the box, where the cameras and the sun aim. */
export function centreOf(bounds: SceneBounds): Vector3 {
  return {
    x: (bounds.minX + bounds.maxX) * HALF,
    y: (bounds.minY + bounds.maxY) * HALF,
    z: (bounds.minZ + bounds.maxZ) * HALF,
  };
}
