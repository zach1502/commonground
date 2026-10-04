/** Joins class names, skipping empty and false entries. */
export function classNames(...names: readonly (string | false | null | undefined)[]): string {
  return names.filter((name): name is string => typeof name === 'string' && name !== '').join(' ');
}
