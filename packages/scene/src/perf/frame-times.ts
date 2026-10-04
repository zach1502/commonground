import { clamp } from '@parkshape/core';

import { valueAt } from '../geometry/arrays.js';

/** Nearest-rank percentile of a list of samples, for example 0.95 for p95. */
export function percentile(values: readonly number[], fraction: number): number {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const rank = clamp(Math.ceil(fraction * sorted.length), 1, sorted.length);
  return valueAt(sorted, rank - 1);
}
