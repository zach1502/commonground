/** What a key does on a focused row of the Items list. */
export type RowKeyEffect =
  | { readonly kind: 'focus'; readonly index: number }
  | { readonly kind: 'select' }
  | { readonly kind: 'delete' }
  | { readonly kind: 'hold' }
  | { readonly kind: 'pass' };

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 };

/**
 * Arrow keys, Home and End move between rows, Enter selects, and Delete or Backspace removes
 * a free row. A locked row holds Delete, so the page's own Delete shortcut never takes it.
 */
export function rowKeyEffect(
  key: string,
  at: { readonly index: number; readonly count: number; readonly locked: 'locked' | 'free' },
): RowKeyEffect {
  const last = Math.max(at.count - 1, 0);
  const step = STEPS[key];
  if (step !== undefined)
    return { kind: 'focus', index: Math.min(Math.max(at.index + step, 0), last) };
  if (key === 'Home') return { kind: 'focus', index: 0 };
  if (key === 'End') return { kind: 'focus', index: last };
  if (key === 'Enter') return { kind: 'select' };
  if (key === 'Delete' || key === 'Backspace') {
    return at.locked === 'locked' ? { kind: 'hold' } : { kind: 'delete' };
  }
  return { kind: 'pass' };
}
