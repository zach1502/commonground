import type { Random } from '../ports/random.js';

// mulberry32 constants, from the reference implementation by Tommy Ettinger.
const MULBERRY32_INCREMENT = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const ODD_MIX = 61;
// 2 ** 32, written out so the divisor is a single named constant.
const UINT32_RANGE = 4_294_967_296;

/** Deterministic Random using the mulberry32 generator; equal seeds give equal sequences. */
export function createSeededRandom(seed: number): Random {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + MULBERRY32_INCREMENT) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> SHIFT_A), t | 1);
      t ^= t + Math.imul(t ^ (t >>> SHIFT_B), t | ODD_MIX);
      return ((t ^ (t >>> SHIFT_C)) >>> 0) / UINT32_RANGE;
    },
  };
}
