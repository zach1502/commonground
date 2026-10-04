import type { Clock, DesignItem } from '@parkshape/core';

import type { CommandSpec, SingleCommandSpec } from '../editor/command-schema.js';
import { GHOST_OPACITY } from '../editor/overlay-style.js';

import type { MotionPreference } from './rise.js';
import { SMALL_MS } from './tokens.js';
import { FRAME_CLOCK, Tween, tweenProgress } from './tween.js';

/** The juice plan J17: a placed item starts this far above the ground and settles onto it. */
export const SETTLE_DROP_M = 0.15;

/** The last change to the undo history, with a serial so the same spec twice still counts. */
export interface HistoryChange {
  readonly step: 'execute' | 'undo' | 'redo';
  readonly spec: CommandSpec;
  readonly serial: number;
}

/** Items that appear and settle onto the ground, or that lift and fade out. */
export interface PlacementMotion {
  readonly kind: 'settle' | 'lift';
  readonly items: readonly DesignItem[];
  readonly serial: number;
}

export interface PlacementLook {
  /** Height above the item's resting place, never below 0. */
  readonly offsetM: number;
  readonly opacity: number;
}

const singlesOf = (spec: CommandSpec): readonly SingleCommandSpec[] =>
  spec.kind === 'batch' ? spec.commands : [spec];

/** Every command adds an item, every one deletes one, or the spec is something else. */
function itemEdit(spec: CommandSpec): { kind: 'add' | 'delete'; items: DesignItem[] } | null {
  const singles = singlesOf(spec);
  if (singles.length === 0) return null;
  const items = singles.flatMap((single) =>
    single.kind === 'add-item' || single.kind === 'delete-item' ? [single.item] : [],
  );
  if (items.length !== singles.length) return null;
  if (singles.every((single) => single.kind === 'add-item')) return { kind: 'add', items };
  if (singles.every((single) => single.kind === 'delete-item')) return { kind: 'delete', items };
  return null;
}

/**
 * Which items move after a history change. A click to place settles the item; undo of a place
 * lifts it out and redo settles it again; undo of a delete settles the items back and redo lifts
 * them. A plain delete, a duplicate and every other command stay instant.
 */
export function placementMotionOf(change: HistoryChange | null): PlacementMotion | null {
  if (change === null) return null;
  const edit = itemEdit(change.spec);
  if (edit === null) return null;
  const { serial } = change;
  if (change.step === 'execute') {
    const placed = edit.kind === 'add' && change.spec.kind !== 'batch';
    return placed ? { kind: 'settle', items: edit.items, serial } : null;
  }
  const appears = (change.step === 'redo') === (edit.kind === 'add');
  return { kind: appears ? 'settle' : 'lift', items: edit.items, serial };
}

export interface PlacementLookOptions {
  readonly kind: PlacementMotion['kind'];
  readonly motion: MotionPreference;
}

/**
 * The item's look this many ms into the motion. A settle drops 0.15 m from ghost opacity to the
 * ground at full opacity on the entry curve; a lift is the same path in reverse on the exit curve.
 */
export function placementLook(elapsedMs: number, options: PlacementLookOptions): PlacementLook {
  const settles = options.kind === 'settle';
  if (options.motion === 'reduced' || elapsedMs >= SMALL_MS) {
    return settles ? { offsetM: 0, opacity: 1 } : { offsetM: SETTLE_DROP_M, opacity: 0 };
  }
  const tween = { durationMs: SMALL_MS, motion: options.motion } as const;
  const elapsed = Math.max(elapsedMs, 0);
  if (settles) {
    const amount = tweenProgress(elapsed, { ...tween, curve: 'entry' });
    return {
      offsetM: SETTLE_DROP_M * (1 - amount),
      opacity: GHOST_OPACITY + (1 - GHOST_OPACITY) * amount,
    };
  }
  const amount = tweenProgress(elapsed, { ...tween, curve: 'exit' });
  return { offsetM: SETTLE_DROP_M * amount, opacity: 1 - amount };
}

/**
 * Opacity of the ghost-coloured veil drawn over the item while it moves: the ghost's 0.5 at the
 * start of a settle, clearing as the item turns solid, and the reverse for a lift.
 */
export function veilOpacity(look: PlacementLook): number {
  return Math.min(1 - look.opacity, GHOST_OPACITY);
}

/** A settle or lift that started when it was made, read from a clock on each frame. */
export class PlacementTween {
  private readonly clock: Tween;

  constructor(
    private readonly options: PlacementLookOptions,
    source: Clock = FRAME_CLOCK,
  ) {
    this.clock = new Tween(
      { durationMs: SMALL_MS, curve: 'entry', motion: options.motion },
      source,
    );
  }

  look(): PlacementLook {
    return placementLook(this.clock.elapsedMs(), this.options);
  }

  state(): 'running' | 'done' {
    return this.clock.state();
  }
}
