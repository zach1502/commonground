import { cellCentre, maskIndexes, rasterizeOrientedRect, type Grid } from '@parkshape/core';

import type {
  BrushStroke,
  CellSampler,
  DeltaPatch,
  FlattenStroke,
  LevelStroke,
  SmoothStroke,
} from './types.js';

/** Metres of rise or fall per second at full strength and the brush centre. */
const RAISE_METRES_PER_SECOND = 4;
/** Fraction of the gap to a target closed per second at full strength. */
const BLEND_PER_SECOND = 6;
const MAX_BLEND = 1;

interface CellHit {
  readonly x: number;
  readonly y: number;
  readonly index: number;
  readonly falloff: number;
}

/** Smooth bump: 1 at the centre, 0 at the rim, with a flat top and flat edge. */
function falloffAt(distanceM: number, radiusM: number): number {
  if (radiusM <= 0 || distanceM >= radiusM) return 0;
  const t = distanceM / radiusM;
  return (1 - t * t) * (1 - t * t);
}

/** Grid cells whose centres fall inside the brush, each with its falloff weight. */
function cellsWithin(grid: Grid, centre: BrushStroke['centre'], radiusM: number): CellHit[] {
  const { originLocal, cellM, width, height } = grid;
  const firstX = Math.max(0, Math.floor((centre.x - radiusM - originLocal.x) / cellM));
  const firstY = Math.max(0, Math.floor((centre.y - radiusM - originLocal.y) / cellM));
  const lastX = Math.min(width - 1, Math.ceil((centre.x + radiusM - originLocal.x) / cellM));
  const lastY = Math.min(height - 1, Math.ceil((centre.y + radiusM - originLocal.y) / cellM));
  const hits: CellHit[] = [];
  for (let y = firstY; y <= lastY; y += 1) {
    for (let x = firstX; x <= lastX; x += 1) {
      const point = cellCentre(grid, x, y);
      const distanceM = Math.hypot(point.x - centre.x, point.y - centre.y);
      const falloff = falloffAt(distanceM, radiusM);
      if (falloff > 0) hits.push({ x, y, index: y * width + x, falloff });
    }
  }
  return hits;
}

function patchOf(hits: readonly CellHit[], deltaOf: (hit: CellHit) => number): DeltaPatch {
  const cells = hits
    .map((hit) => ({ x: hit.x, y: hit.y, deltaM: deltaOf(hit) }))
    .filter((cell) => cell.deltaM !== 0);
  return { cells };
}

/** Raises (positive) or lowers (negative) terrain by a falloff-weighted step. */
export function raiseLower(stroke: BrushStroke, direction: 'raise' | 'lower'): DeltaPatch {
  const step = stroke.strength * stroke.dt * RAISE_METRES_PER_SECOND;
  const sign = direction === 'raise' ? 1 : -1;
  return patchOf(
    cellsWithin(stroke.grid, stroke.centre, stroke.radiusM),
    (hit) => sign * step * hit.falloff,
  );
}

function neighbourhoodAverage(sample: CellSampler, grid: Grid, x: number, y: number): number {
  const clampX = (value: number) => Math.min(grid.width - 1, Math.max(0, value));
  const clampY = (value: number) => Math.min(grid.height - 1, Math.max(0, value));
  const points = [
    [x, y],
    [clampX(x - 1), y],
    [clampX(x + 1), y],
    [x, clampY(y - 1)],
    [x, clampY(y + 1)],
  ] as const;
  const total = points.reduce((sum, [px, py]) => sum + sample(px, py), 0);
  return total / points.length;
}

/** Blends each cell toward the mean of its neighbours, flattening bumps and dips. */
export function smoothBrush(stroke: SmoothStroke): DeltaPatch {
  const blend = Math.min(MAX_BLEND, stroke.strength * stroke.dt * BLEND_PER_SECOND);
  const hits = cellsWithin(stroke.grid, stroke.centre, stroke.radiusM);
  return patchOf(hits, (hit) => {
    const target = neighbourhoodAverage(stroke.sample, stroke.grid, hit.x, hit.y);
    return (target - stroke.sample(hit.x, hit.y)) * blend * hit.falloff;
  });
}

/** Blends each cell toward a single target elevation. */
export function flattenBrush(stroke: FlattenStroke): DeltaPatch {
  const blend = Math.min(MAX_BLEND, stroke.strength * stroke.dt * BLEND_PER_SECOND);
  const hits = cellsWithin(stroke.grid, stroke.centre, stroke.radiusM);
  return patchOf(
    hits,
    (hit) => (stroke.targetM - stroke.sample(hit.x, hit.y)) * blend * hit.falloff,
  );
}

/** Levels the cells under an item footprint to their mean elevation, making a flat pad. */
export function levelUnderItem(stroke: LevelStroke): DeltaPatch {
  const indexes = maskIndexes(rasterizeOrientedRect(stroke.grid, stroke.footprint));
  if (indexes.length === 0) return { cells: [] };
  const at = (index: number) => ({
    x: index % stroke.grid.width,
    y: Math.floor(index / stroke.grid.width),
  });
  const mean =
    indexes.reduce((sum, index) => sum + stroke.sample(at(index).x, at(index).y), 0) /
    indexes.length;
  const cells = indexes
    .map((index) => ({ ...at(index), deltaM: mean - stroke.sample(at(index).x, at(index).y) }))
    .filter((cell) => cell.deltaM !== 0);
  return { cells };
}
