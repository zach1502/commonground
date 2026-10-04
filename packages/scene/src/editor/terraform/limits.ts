import {
  cellCentre,
  clamp,
  maskIndexes,
  rasterizeCircle,
  rasterizePolygon,
  type Grid,
  type LockedTree,
  type PlanePoint,
  type Zone,
} from '@parkshape/core';

import { deltaField } from './grade-delta.js';
import type { DeltaPatch, GradeCellDelta } from './types.js';

/** Why a brushed cell was refused. */
export type RejectReason =
  | { readonly kind: 'noGrade'; readonly zoneLabel: string }
  | { readonly kind: 'rootZone'; readonly treeLabel: string };

export interface RejectedCell {
  readonly x: number;
  readonly y: number;
  readonly reason: RejectReason;
}

export interface ClampInput {
  readonly grid: Grid;
  readonly patch: DeltaPatch;
  /** The design's accumulated grade delta, measured from existing terrain. */
  readonly currentDelta: DeltaPatch;
  readonly maxDeviationM: number;
  readonly noGradeZones: readonly Zone[];
  readonly lockedTrees: readonly LockedTree[];
  readonly rootZonePerDbhCm: number;
  /** Whether a point is on the parcel's ground; cells off it are dropped, as off the grid. */
  readonly onGround?: ((point: PlanePoint) => boolean) | undefined;
}

export interface ClampResult {
  readonly applied: DeltaPatch;
  readonly rejected: readonly RejectedCell[];
}

/** Cell index to the reason it is blocked, root zones taking priority over no-grade zones. */
function blockedCells(input: ClampInput): Map<number, RejectReason> {
  const blocked = new Map<number, RejectReason>();
  input.noGradeZones
    .filter((zone) => zone.kind === 'noGrade')
    .forEach((zone) => {
      const reason: RejectReason = { kind: 'noGrade', zoneLabel: zone.label };
      maskIndexes(rasterizePolygon(input.grid, zone.polygon)).forEach((index) => {
        blocked.set(index, reason);
      });
    });
  input.lockedTrees.forEach((tree) => {
    const reason: RejectReason = { kind: 'rootZone', treeLabel: tree.label };
    const radiusM = input.rootZonePerDbhCm * tree.dbhCm;
    maskIndexes(rasterizeCircle(input.grid, tree.position, radiusM)).forEach((index) => {
      blocked.set(index, reason);
    });
  });
  return blocked;
}

/**
 * Refuses cells in no-grade zones or locked-tree root zones, then clamps the rest so the
 * accumulated deviation from existing grade never leaves the plus or minus maxDeviationM band.
 * Cells outside the parcel outline are dropped, since there is no ground there to grade.
 */
export function clampDelta(input: ClampInput): ClampResult {
  const blocked = blockedCells(input);
  const field = deltaField(input.grid.width, input.currentDelta);
  const applied: GradeCellDelta[] = [];
  const rejected: RejectedCell[] = [];
  const onGround = input.onGround ?? (() => true);
  const cells = input.patch.cells.filter((cell) =>
    onGround(cellCentre(input.grid, cell.x, cell.y)),
  );
  cells.forEach((cell) => {
    const index = cell.y * input.grid.width + cell.x;
    const reason = blocked.get(index);
    if (reason !== undefined) {
      rejected.push({ x: cell.x, y: cell.y, reason });
      return;
    }
    const base = field.get(index) ?? 0;
    const next = clamp(base + cell.deltaM, -input.maxDeviationM, input.maxDeviationM);
    const deltaM = next - base;
    if (deltaM !== 0) applied.push({ x: cell.x, y: cell.y, deltaM });
  });
  return { applied: { cells: applied }, rejected };
}
