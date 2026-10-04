import { PERCENT_SCALE } from '../constants.js';
import { ringEdges, type Edge, type PlanePoint } from '../schema/geometry.js';

import type { Heightmap } from './heightmap.js';

const HALF = 0.5;
const DEGREES_PER_HALF_TURN = 180;
// Crossings come in entry and exit pairs.
const CROSSINGS_PER_SPAN = 2;

/** Square cells, row by row from the south-west corner, matching the heightmap layout. */
export interface Grid {
  readonly width: number;
  readonly height: number;
  readonly cellM: number;
  readonly originLocal: PlanePoint;
}

/** One byte per grid cell: 1 when the shape covers the cell centre, else 0. */
export interface Mask {
  readonly grid: Grid;
  readonly cells: Uint8Array;
}

export interface OrientedRect {
  readonly centre: PlanePoint;
  /** Size along the local x axis before rotation. */
  readonly widthM: number;
  readonly depthM: number;
  /** Counter-clockwise from east. */
  readonly rotationDeg: number;
}

interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function gridOf(heightmap: Heightmap): Grid {
  const { width, height, resolutionM, originLocal } = heightmap;
  return { width, height, cellM: resolutionM, originLocal };
}

export function emptyMask(grid: Grid): Mask {
  return { grid, cells: new Uint8Array(grid.width * grid.height) };
}

export function cellCentre(grid: Grid, i: number, j: number): PlanePoint {
  return {
    x: grid.originLocal.x + (i + HALF) * grid.cellM,
    y: grid.originLocal.y + (j + HALF) * grid.cellM,
  };
}

/** Indexes of cells whose centres lie in [min, max] along one axis. */
interface Axis {
  readonly origin: number;
  readonly cellM: number;
  readonly count: number;
}

function centreRange(min: number, max: number, axis: Axis) {
  return {
    first: Math.max(0, Math.ceil((min - axis.origin) / axis.cellM - HALF)),
    last: Math.min(axis.count - 1, Math.floor((max - axis.origin) / axis.cellM - HALF)),
  };
}

/** Marks every cell in the bounds whose centre passes the test. */
function markWhere(grid: Grid, bounds: Bounds, covers: (centre: PlanePoint) => boolean): Mask {
  const mask = emptyMask(grid);
  const { originLocal: origin, cellM } = grid;
  const columns = centreRange(bounds.minX, bounds.maxX, {
    origin: origin.x,
    cellM,
    count: grid.width,
  });
  const rows = centreRange(bounds.minY, bounds.maxY, {
    origin: origin.y,
    cellM,
    count: grid.height,
  });
  for (let j = rows.first; j <= rows.last; j += 1) {
    for (let i = columns.first; i <= columns.last; i += 1) {
      if (covers(cellCentre(grid, i, j))) mask.cells[j * grid.width + i] = 1;
    }
  }
  return mask;
}

/** Marks the cell under the point when the shape missed every cell centre. */
function withCellUnder(mask: Mask, point: PlanePoint): Mask {
  if (mask.cells.some((cell) => cell === 1)) return mask;
  const { grid } = mask;
  const i = Math.floor((point.x - grid.originLocal.x) / grid.cellM);
  const j = Math.floor((point.y - grid.originLocal.y) / grid.cellM);
  if (i >= 0 && j >= 0 && i < grid.width && j < grid.height) mask.cells[j * grid.width + i] = 1;
  return mask;
}

function squareAround(centre: PlanePoint, reachM: number): Bounds {
  return {
    minX: centre.x - reachM,
    minY: centre.y - reachM,
    maxX: centre.x + reachM,
    maxY: centre.y + reachM,
  };
}

export function rasterizeCircle(grid: Grid, centre: PlanePoint, radiusM: number): Mask {
  const inside = (point: PlanePoint) =>
    Math.hypot(point.x - centre.x, point.y - centre.y) <= radiusM;
  return withCellUnder(markWhere(grid, squareAround(centre, radiusM), inside), centre);
}

export function rasterizeOrientedRect(grid: Grid, rect: OrientedRect): Mask {
  const angle = (rect.rotationDeg * Math.PI) / DEGREES_PER_HALF_TURN;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const halfWidth = rect.widthM * HALF;
  const halfDepth = rect.depthM * HALF;
  const inside = (point: PlanePoint) => {
    const dx = point.x - rect.centre.x;
    const dy = point.y - rect.centre.y;
    return (
      Math.abs(dx * cos + dy * sin) <= halfWidth && Math.abs(-dx * sin + dy * cos) <= halfDepth
    );
  };
  const reach = Math.hypot(halfWidth, halfDepth);
  return withCellUnder(markWhere(grid, squareAround(rect.centre, reach), inside), rect.centre);
}

interface Segment {
  readonly from: PlanePoint;
  readonly to: PlanePoint;
}

function distanceToSegment(point: PlanePoint, edge: Segment): number {
  const dx = edge.to.x - edge.from.x;
  const dy = edge.to.y - edge.from.y;
  const lengthSquared = dx * dx + dy * dy;
  const along =
    lengthSquared === 0
      ? 0
      : ((point.x - edge.from.x) * dx + (point.y - edge.from.y) * dy) / lengthSquared;
  const t = Math.min(Math.max(along, 0), 1);
  return Math.hypot(point.x - (edge.from.x + t * dx), point.y - (edge.from.y + t * dy));
}

function segmentBounds(edge: Segment, reachM: number): Bounds {
  return {
    minX: Math.min(edge.from.x, edge.to.x) - reachM,
    minY: Math.min(edge.from.y, edge.to.y) - reachM,
    maxX: Math.max(edge.from.x, edge.to.x) + reachM,
    maxY: Math.max(edge.from.y, edge.to.y) + reachM,
  };
}

/** Cells whose centres lie within half the width of the polyline, with round ends. */
export function rasterizeRibbon(grid: Grid, points: readonly PlanePoint[], widthM: number): Mask {
  const halfWidth = widthM * HALF;
  const segments = points.slice(1).map((to, index) => ({ from: points[index] ?? to, to }));
  const pieces = segments.map((edge) =>
    markWhere(grid, segmentBounds(edge, halfWidth), (centre) => {
      return distanceToSegment(centre, edge) <= halfWidth;
    }),
  );
  return union(grid, pieces);
}

/** X positions where the polygon's edges cross the horizontal line at y, sorted. */
function rowCrossings(edges: readonly Edge[], y: number): number[] {
  return edges
    .filter(({ from, to }) => from.y <= y !== to.y <= y)
    .map(({ from, to }) => from.x + ((y - from.y) * (to.x - from.x)) / (to.y - from.y))
    .sort((a, b) => a - b);
}

/** Cells in row j whose centres lie in [fromX, toX). */
function fillSpan(mask: Mask, j: number, fromX: number, toX: number): void {
  const { grid } = mask;
  const toIndex = (x: number) => Math.ceil((x - grid.originLocal.x) / grid.cellM - HALF);
  const first = Math.max(0, toIndex(fromX));
  const last = Math.min(grid.width, toIndex(toX)) - 1;
  for (let i = first; i <= last; i += 1) mask.cells[j * grid.width + i] = 1;
}

function spanPairs(crossings: readonly number[]): [number, number][] {
  const pairs: [number, number][] = [];
  for (let k = 0; k + 1 < crossings.length; k += CROSSINGS_PER_SPAN) {
    pairs.push([crossings[k] ?? 0, crossings[k + 1] ?? 0]);
  }
  return pairs;
}

/** Scanline fill by cell centre with the even-odd rule. */
export function rasterizePolygon(grid: Grid, polygon: readonly PlanePoint[]): Mask {
  const mask = emptyMask(grid);
  const edges = ringEdges(polygon);
  for (let j = 0; j < grid.height; j += 1) {
    const { y } = cellCentre(grid, 0, j);
    spanPairs(rowCrossings(edges, y)).forEach(([fromX, toX]) => {
      fillSpan(mask, j, fromX, toX);
    });
  }
  return mask;
}

export function union(grid: Grid, masks: readonly Mask[]): Mask {
  const combined = emptyMask(grid);
  masks.forEach((mask) => {
    mask.cells.forEach((cell, index) => {
      if (cell === 1) combined.cells[index] = 1;
    });
  });
  return combined;
}

export function intersectCount(a: Mask, b: Mask): number {
  let shared = 0;
  a.cells.forEach((cell, index) => {
    if (cell === 1 && b.cells[index] === 1) shared += 1;
  });
  return shared;
}

export function countCells(mask: Mask): number {
  return mask.cells.reduce((total, cell) => total + cell, 0);
}

/** Flat indexes (j * width + i) of the covered cells, in ascending order. */
export function maskIndexes(mask: Mask): number[] {
  const indexes: number[] = [];
  mask.cells.forEach((cell, index) => {
    if (cell === 1) indexes.push(index);
  });
  return indexes;
}

export function areaM2(mask: Mask): number {
  return countCells(mask) * mask.grid.cellM * mask.grid.cellM;
}

/** Share of the whole mask's cells that the part also covers, as a percent. */
export function coveragePercent(part: Mask, whole: Mask): number {
  const wholeCells = countCells(whole);
  return wholeCells === 0 ? 0 : (intersectCount(part, whole) / wholeCells) * PERCENT_SCALE;
}
