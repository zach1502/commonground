/** DESIGN.md "Motion": small changes run 150 ms. */
export const SMALL_MS = 150;
/** DESIGN.md "Motion": panels and views change over 250 ms. */
export const VIEW_CHANGE_MS = 250;
/** The juice plan: a camera move in the scene runs 400 ms. */
export const CAMERA_MOVE_MS = 400;

export interface CubicCurve {
  readonly x1: number;
  readonly y1: number;
  readonly x2: number;
  readonly y2: number;
}

export type CurveName = 'entry' | 'exit' | 'move';

/**
 * The three curves of the ui motion module: entry eases out, exit eases in, and something that
 * stays on screen and moves eases in and out. Every y stays inside 0 to 1, so nothing overshoots.
 */
export const CURVES: Readonly<Record<CurveName, CubicCurve>> = {
  entry: { x1: 0.05, y1: 0.7, x2: 0.1, y2: 1 },
  exit: { x1: 0.3, y1: 0, x2: 1, y2: 1 },
  move: { x1: 0.2, y1: 0, x2: 0, y2: 1 },
};

/** The curve as a CSS easing string, for the Web Animations API and the parity test. */
export function cssCurve(name: CurveName): string {
  const { x1, y1, x2, y2 } = CURVES[name];
  return `cubic-bezier(${[x1, y1, x2, y2].map(String).join(', ')})`;
}
