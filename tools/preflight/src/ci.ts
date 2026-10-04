const FALSE_VALUES = new Set(['', '0', 'false', 'no', 'off']);

/** True when an environment flag such as CI is set to anything but a false value. */
export function isTruthyFlag(value: string | undefined): boolean {
  return value !== undefined && !FALSE_VALUES.has(value.trim().toLowerCase());
}
