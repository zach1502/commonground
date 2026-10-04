// Fail fixture: a boolean flag parameter.
export function f(verbose: boolean): string {
  return verbose ? 'long' : 'short';
}
