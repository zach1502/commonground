/** Numbers per vertex in a position or normal array. */
export const VECTOR_SIZE = 3;
export const Y_OFFSET = 1;
export const Z_OFFSET = 2;
export const HALF = 0.5;
/** Each ring vertex has a copy at the top and one at the bottom of the skirt. */
export const TOP_AND_BOTTOM = 2;
export const QUARTER_TURN = Math.PI * HALF;
export const FULL_TURN = Math.PI + Math.PI;

/** Maps a random number in [0, 1) to [-1, 1). */
export function symmetric(unit: number): number {
  return unit + unit - 1;
}
