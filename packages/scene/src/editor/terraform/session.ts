import {
  lockedTrees,
  type DesignDocument,
  type OrientedRect,
  type PlanePoint,
} from '@parkshape/core';

import type { EditorContext } from '../actions/context.js';
import { terraform } from '../commands.js';
import type { TerraformSettings } from '../store/types.js';

import { flattenBrush, levelUnderItem, raiseLower, smoothBrush } from './brush.js';
import { deltaField, mergeGradeDelta } from './grade-delta.js';
import { clampDelta } from './limits.js';
import { patchRegion, type CellRegion } from './region.js';
import type { CellSampler, DeltaPatch } from './types.js';

export interface TerraformSessionInput {
  readonly ctx: EditorContext;
  readonly settings: TerraformSettings;
  /** The footprint to level under, required only by the level-item mode. */
  readonly footprint?: OrientedRect | null;
}

/** One hold-to-apply drag: applies the brush live, then commits a single undoable command. */
export interface TerraformSession {
  /** Applies one frame of the brush at a ground point and returns the region to rebuild. */
  readonly stroke: (centre: PlanePoint, dt: number) => CellRegion | null;
  /** Restores the pre-drag document and pushes the coalesced result as one command. */
  readonly end: () => void;
  readonly cancel: () => void;
}

function samplerFor(ctx: EditorContext, document: DesignDocument): CellSampler {
  const { width } = ctx.grid;
  const field = deltaField(width, document.gradeDelta);
  const base = ctx.baseHeightmap.elevations;
  return (x, y) => (base[y * width + x] ?? 0) + (field.get(y * width + x) ?? 0);
}

function cellUnder(
  ctx: EditorContext,
  centre: PlanePoint,
): { readonly x: number; readonly y: number } {
  const { originLocal, cellM, width, height } = ctx.grid;
  const x = Math.min(width - 1, Math.max(0, Math.floor((centre.x - originLocal.x) / cellM)));
  const y = Math.min(height - 1, Math.max(0, Math.floor((centre.y - originLocal.y) / cellM)));
  return { x, y };
}

interface KernelInput {
  readonly ctx: EditorContext;
  readonly settings: TerraformSettings;
  readonly centre: PlanePoint;
  readonly dt: number;
  readonly sample: CellSampler;
  readonly footprint?: OrientedRect | null;
  readonly targetM: number;
}

function kernelPatch(input: KernelInput): DeltaPatch {
  const { ctx, settings, centre, dt, sample } = input;
  const stroke = {
    grid: ctx.grid,
    centre,
    radiusM: settings.radiusM,
    strength: settings.strength,
    dt,
  };
  switch (settings.mode) {
    case 'raise':
      return raiseLower(stroke, 'raise');
    case 'lower':
      return raiseLower(stroke, 'lower');
    case 'smooth':
      return smoothBrush({ ...stroke, sample });
    case 'flatten':
      return flattenBrush({ ...stroke, sample, targetM: input.targetM });
    case 'level-item':
      return input.footprint == null
        ? { cells: [] }
        : levelUnderItem({ grid: ctx.grid, footprint: input.footprint, sample });
  }
}

/** Begins a terraform drag. The caller feeds pointer moves to stroke and calls end on release. */
export function beginTerraform(input: TerraformSessionInput): TerraformSession {
  const { ctx, settings } = input;
  const start = ctx.store.getState().document;
  const trees = lockedTrees(start, ctx.catalog);
  let net: DesignDocument['gradeDelta'] = { cells: [] };
  let target: number | null = null;

  const stroke = (centre: PlanePoint, dt: number): CellRegion | null => {
    const live = ctx.store.getState().document;
    const sample = samplerFor(ctx, live);
    if (target === null) {
      const cell = cellUnder(ctx, centre);
      target = sample(cell.x, cell.y);
    }
    const patch = kernelPatch({
      ctx,
      settings,
      centre,
      dt,
      sample,
      footprint: input.footprint ?? null,
      targetM: target,
    });
    const clamped = clampDelta({
      grid: ctx.grid,
      patch,
      currentDelta: live.gradeDelta,
      maxDeviationM: ctx.terraform.maxDeviationM,
      noGradeZones: ctx.zones,
      lockedTrees: trees,
      rootZonePerDbhCm: ctx.terraform.rootZonePerDbhCm,
      onGround: ctx.onGround,
    });
    if (clamped.applied.cells.length === 0) return null;
    ctx.store.getState().replaceDocument({
      ...live,
      gradeDelta: mergeGradeDelta(live.gradeDelta, clamped.applied),
    });
    net = mergeGradeDelta(net, clamped.applied);
    return patchRegion(clamped.applied, ctx.grid);
  };

  const end = (): void => {
    ctx.store.getState().replaceDocument(start);
    if (net.cells.length > 0) ctx.store.getState().execute(terraform(net.cells));
  };

  const cancel = (): void => {
    ctx.store.getState().replaceDocument(start);
  };

  return { stroke, end, cancel };
}

/** Seconds of brush a single click or an Enter press applies, near a fifth of a second held. */
export const STEP_SECONDS = 0.2;

/** Applies one brush step at a ground point and commits it: the single-click and keyboard path. */
export function applyStep(
  input: TerraformSessionInput,
  centre: PlanePoint,
  seconds: number = STEP_SECONDS,
): CellRegion | null {
  const session = beginTerraform(input);
  const region = session.stroke(centre, seconds);
  session.end();
  return region;
}

export type { CellRegion } from './region.js';
