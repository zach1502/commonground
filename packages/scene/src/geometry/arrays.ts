/** Reads a number that must exist; an index outside the array is a bug, so it throws. */
export function valueAt(values: ArrayLike<number>, index: number): number {
  const value = values[index];
  if (value === undefined) {
    throw new RangeError(`Index ${String(index)} is outside an array of ${String(values.length)}`);
  }
  return value;
}

/** Reads an item of a closed ring such as an outline; indices wrap in both directions. */
export function itemAt<T>(items: readonly T[], index: number): T {
  const item = items[((index % items.length) + items.length) % items.length];
  if (item === undefined) {
    throw new RangeError('Cannot read from an empty list');
  }
  return item;
}
