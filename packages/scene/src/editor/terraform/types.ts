import type { Grid, OrientedRect, PlanePoint } from '@parkshape/core';

/** The five terraform brush modes. */
export type TerraformMode = 'raise' | 'lower' | 'smooth' | 'flatten' | 'level-item';

/** One cell's grade change in metres, before it is branded into a document's gradeDelta. */
export interface GradeCellDelta {
  readonly x: number;
  readonly y: number;
  readonly deltaM: number;
}

/** A sparse set of per-cell grade increments, the shape merged into a document's gradeDelta. */
export interface DeltaPatch {
  readonly cells: readonly GradeCellDelta[];
}

/** Current graded elevation at an integer grid cell, in metres. */
export type CellSampler = (x: number, y: number) => number;

/** Shared brush stroke inputs. Strength is 0 to 1; dt is the frame time in seconds. */
export interface BrushStroke {
  readonly grid: Grid;
  readonly centre: PlanePoint;
  readonly radiusM: number;
  readonly strength: number;
  readonly dt: number;
}

export interface SmoothStroke extends BrushStroke {
  readonly sample: CellSampler;
}

export interface FlattenStroke extends SmoothStroke {
  readonly targetM: number;
}

export interface LevelStroke {
  readonly grid: Grid;
  readonly footprint: OrientedRect;
  readonly sample: CellSampler;
}
