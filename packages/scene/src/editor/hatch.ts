/** DESIGN.md "Terraform": zones where grading is blocked are hatched in red. */
export interface HatchSpec {
  /** Distance between stripe centres, in CSS pixels along a screen axis. */
  readonly periodPx: number;
  /** Stripe width along the same axis; the rest of the period is a clear gap. */
  readonly stripePx: number;
}

/**
 * Stripes are laid out in screen pixels, not metres, so they stay crisp at every zoom. Stripes
 * laid out in metres blur together into a flat patch once the camera pulls back.
 */
export const HATCH: HatchSpec = { periodPx: 10, stripePx: 4 };
/** The stripes are the danger colour at this opacity; the gaps are fully clear. */
export const HATCH_OPACITY = 0.8;

const HALF = 0.5;

const wrap = (value: number, period: number): number => ((value % period) + period) % period;

/**
 * How much of the pixel at (x, y) a stripe covers, 0 to 1. Stripes run at 45 degrees along
 * x + y = constant and are smoothed over one pixel at each edge. The hatch shader in
 * `editor-components/canvas/hatch-material.ts` computes the same value from gl_FragCoord.
 */
export function hatchCoverage(xPx: number, yPx: number, spec: HatchSpec): number {
  const phase = wrap(xPx + yPx, spec.periodPx);
  const fromCentre = Math.abs(phase - spec.periodPx * HALF);
  return Math.min(Math.max(spec.stripePx * HALF - fromCentre + HALF, 0), 1);
}
