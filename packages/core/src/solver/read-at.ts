/**
 * The value at an index, or the fallback past the end. Indexed reads on arrays and typed arrays
 * may be undefined under noUncheckedIndexedAccess; reading through here keeps that in one place.
 */
export function readAt<T>(values: ArrayLike<T>, index: number, fallback: T): T {
  return index >= 0 && index < values.length ? (values[index] as T) : fallback;
}
