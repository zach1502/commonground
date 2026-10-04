import type { EnvSource } from './browser.js';

const FALSE_VALUES = new Set(['', '0', 'false', 'no', 'off']);

/**
 * Whether the process runs under a CI service, which sets CI. Test harnesses read it; the app
 * never does, so it is not in the env schema.
 */
export function runsInCi(source: EnvSource = process.env): boolean {
  const value = source.CI;
  return value !== undefined && !FALSE_VALUES.has(value.trim().toLowerCase());
}
