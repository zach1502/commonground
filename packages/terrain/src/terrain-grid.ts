import { err, ok, type PlanePoint, type Result } from '@parkshape/core';

import type { TerrainError, TerrainRequest } from './ports/terrain-provider.js';

const HALF_CELL = 0.5;
// Extents within this share of a cell of a whole number of cells are treated as whole.
const CELL_SNAP = 1e-6;
// A sample may sit this many pixels past the outer pixel centres and still clamp to the edge.
const EDGE_REACH_PX = 1;

/** A regular grid in the local frame, the shape of a Heightmap without its elevations. */
export interface GridSpec {
  readonly width: number;
  readonly height: number;
  readonly resolutionM: number;
  readonly originLocal: PlanePoint;
}

function cellsAcross(extentM: number, resolutionM: number): number {
  return Math.max(1, Math.ceil(extentM / resolutionM - CELL_SNAP));
}

/** The smallest grid, aligned to the minimum corner, that covers every point. */
export function gridCovering(points: readonly PlanePoint[], resolutionM: number): GridSpec {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return {
    width: cellsAcross(Math.max(...xs) - minX, resolutionM),
    height: cellsAcross(Math.max(...ys) - minY, resolutionM),
    resolutionM,
    originLocal: { x: minX, y: minY },
  };
}

/** Cell centres in Heightmap order: row by row from the south-west corner. */
export function cellCentres(grid: GridSpec): PlanePoint[] {
  const { width, height, resolutionM, originLocal } = grid;
  return Array.from({ length: width * height }, (_, index) => ({
    x: originLocal.x + ((index % width) + HALF_CELL) * resolutionM,
    y: originLocal.y + (Math.floor(index / width) + HALF_CELL) * resolutionM,
  }));
}

/** Raster pixels in storage order: row 0 is the top (north) row. */
export interface Raster {
  readonly width: number;
  readonly height: number;
  readonly values: ArrayLike<number>;
  readonly noData?: number;
}

/** A position in pixel units where (0, 0) is the centre of the top-left pixel. */
export interface PixelPosition {
  readonly col: number;
  readonly row: number;
}

function pixel(raster: Raster, col: number, row: number): number | undefined {
  const value = raster.values[row * raster.width + col];
  return value === undefined || value === raster.noData || !Number.isFinite(value)
    ? undefined
    : value;
}

function isReachable(raster: Raster, position: PixelPosition): boolean {
  const { col, row } = position;
  return (
    col >= -EDGE_REACH_PX &&
    row >= -EDGE_REACH_PX &&
    col <= raster.width - 1 + EDGE_REACH_PX &&
    row <= raster.height - 1 + EDGE_REACH_PX
  );
}

/** Bilinear value at a pixel position, or undefined when a neighbour has no data. */
export function bilinearAt(raster: Raster, position: PixelPosition): number | undefined {
  if (!isReachable(raster, position)) return undefined;
  const col = Math.min(Math.max(position.col, 0), raster.width - 1);
  const row = Math.min(Math.max(position.row, 0), raster.height - 1);
  const left = Math.floor(col);
  const top = Math.floor(row);
  const right = Math.min(left + 1, raster.width - 1);
  const bottom = Math.min(top + 1, raster.height - 1);
  const corners = [
    pixel(raster, left, top),
    pixel(raster, right, top),
    pixel(raster, left, bottom),
    pixel(raster, right, bottom),
  ];
  const [topLeft, topRight, bottomLeft, bottomRight] = corners;
  if (
    topLeft === undefined ||
    topRight === undefined ||
    bottomLeft === undefined ||
    bottomRight === undefined
  ) {
    return undefined;
  }
  const s = col - left;
  const t = row - top;
  const upper = topLeft * (1 - s) + topRight * s;
  const lower = bottomLeft * (1 - s) + bottomRight * s;
  return upper * (1 - t) + lower * t;
}

/** The request's resolution, or an error when it is not a positive finite number. */
export function checkResolution(request: TerrainRequest): Result<number, TerrainError> {
  return request.resolutionM > 0 && Number.isFinite(request.resolutionM)
    ? ok(request.resolutionM)
    : err({ kind: 'invalidRequest', reason: 'resolutionM must be a positive number' });
}
