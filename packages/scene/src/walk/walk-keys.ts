import type { Axis, WalkInput, WalkStep } from './walk.js';

const KEY_STEPS: Readonly<Record<string, WalkStep>> = {
  w: 'forward',
  arrowup: 'forward',
  s: 'back',
  arrowdown: 'back',
  a: 'step-left',
  d: 'step-right',
  arrowleft: 'turn-left',
  arrowright: 'turn-right',
};

/** The walk step a key drives: W or ArrowUp forward, S or ArrowDown back, A and D sideways. */
export function walkStepFor(key: string): WalkStep | undefined {
  return KEY_STEPS[key.toLowerCase()];
}

function axisOf(held: ReadonlySet<WalkStep>, plus: WalkStep, minus: WalkStep): Axis {
  if (held.has(plus) === held.has(minus)) return 0;
  return held.has(plus) ? 1 : -1;
}

/** The held steps as one frame's input; opposite keys held together cancel. */
export function inputFrom(held: ReadonlySet<WalkStep>, pace: WalkInput['pace']): WalkInput {
  return {
    forward: axisOf(held, 'forward', 'back'),
    strafe: axisOf(held, 'step-right', 'step-left'),
    turn: axisOf(held, 'turn-left', 'turn-right'),
    pace,
  };
}
