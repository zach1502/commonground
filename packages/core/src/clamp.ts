/** Restricts value to the inclusive range [min, max]. */
export function clamp(value: number, min: number, max: number): number {
  if (min > max) {
    throw new RangeError(`clamp: min ${String(min)} is greater than max ${String(max)}`);
  }
  return Math.min(Math.max(value, min), max);
}
