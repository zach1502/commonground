import type { GroundPoint } from '../types.js';

import type { WalkerState } from './walk.js';

// "Ahead" is inside this cone and this distance; nearer items win.
const AHEAD_HALF_ANGLE_DEG = 25;
const STRAIGHT_ANGLE_DEG = 180;
const AHEAD_HALF_ANGLE_RAD = (AHEAD_HALF_ANGLE_DEG * Math.PI) / STRAIGHT_ANGLE_DEG;
const AHEAD_REACH_M = 25;
const HALF_TURNS_PER_TURN = 2;
const FULL_TURN = Math.PI * HALF_TURNS_PER_TURN;

export interface WalkLandmark {
  readonly id: string;
  readonly position: GroundPoint;
}

export interface Ahead {
  readonly label: string;
  readonly distanceM: number;
}

/** The smallest angle between two headings, from 0 to pi. */
function angleBetween(a: number, b: number): number {
  const turn = (((a - b) % FULL_TURN) + FULL_TURN) % FULL_TURN;
  return Math.min(turn, FULL_TURN - turn);
}

/** The nearest labelled item in front of the walker, or undefined when none is close. */
export function nearestAhead(
  walker: WalkerState,
  items: readonly WalkLandmark[],
  labels: ReadonlyMap<string, string>,
): Ahead | undefined {
  return items.reduce<Ahead | undefined>((best, item) => {
    const label = labels.get(item.id);
    if (label === undefined) return best;
    const dx = item.position.x - walker.position.x;
    const dz = item.position.z - walker.position.z;
    const distanceM = Math.hypot(dx, dz);
    const inCone = angleBetween(Math.atan2(dx, dz), walker.headingRad) <= AHEAD_HALF_ANGLE_RAD;
    if (!inCone || distanceM > AHEAD_REACH_M) return best;
    return best === undefined || distanceM < best.distanceM ? { label, distanceM } : best;
  }, undefined);
}

/** Fills {name} slots in a walk string. */
export function fillWalk(template: string, values: Readonly<Record<string, string | number>>) {
  return template.replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in values ? String(values[name]) : slot,
  );
}

const ANNOUNCE_GAP_MS = 1000;

/**
 * Keeps the live region to one new line a second at most, and never repeats the last line, so
 * a screen reader is not flooded while the walker moves.
 */
export class Announcer {
  private last = '';
  private lastAtMs = -Infinity;

  /** The line to show now, or undefined when it should wait or would repeat. */
  offer(line: string, nowMs: number, urgency: 'now' | 'paced'): string | undefined {
    if (line === this.last) return undefined;
    if (urgency === 'paced' && nowMs - this.lastAtMs < ANNOUNCE_GAP_MS) return undefined;
    this.last = line;
    this.lastAtMs = nowMs;
    return line;
  }
}
