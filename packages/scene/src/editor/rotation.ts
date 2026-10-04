import type { Random } from '@parkshape/core';

/** R and Shift+R turn the selection by this much. */
export const ROTATION_STEP_DEG = 15;
/** Drag distance on the rotate handle for one step. */
export const DRAG_PX_PER_STEP = 20;
const FULL_TURN_DEG = 360;

export type RotationDirection = 'increase' | 'decrease';

export function normaliseDegrees(degrees: number): number {
  return (((degrees % FULL_TURN_DEG) + FULL_TURN_DEG) % FULL_TURN_DEG) + 0;
}

export function snapRotation(degrees: number): number {
  return normaliseDegrees(Math.round(degrees / ROTATION_STEP_DEG) * ROTATION_STEP_DEG);
}

/** The next 15 degree step in the direction, so an odd angle lands back on a step. */
export function rotateByStep(degrees: number, direction: RotationDirection): number {
  const steps = degrees / ROTATION_STEP_DEG;
  const next = direction === 'increase' ? Math.floor(steps) + 1 : Math.ceil(steps) - 1;
  return normaliseDegrees(next * ROTATION_STEP_DEG);
}

export function rotationFromDrag(startDegrees: number, dragPx: number): number {
  const steps = Math.round(dragPx / DRAG_PX_PER_STEP);
  return normaliseDegrees(startDegrees + steps * ROTATION_STEP_DEG);
}

/** A whole-degree turn, so the properties panel shows a number a person can type. */
export function randomRotation(random: Random): number {
  return normaliseDegrees(Math.round(random.next() * FULL_TURN_DEG));
}
