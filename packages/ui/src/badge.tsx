import type { ReactNode } from 'react';

import { classNames } from './class-names.js';

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export interface BadgeProps {
  readonly children: ReactNode;
  readonly tone?: BadgeTone;
  readonly id?: string;
}

/** A short status label. */
export function Badge({ children, tone = 'neutral', id }: BadgeProps) {
  return (
    <span id={id} className={classNames('ps-badge', `ps-badge--${tone}`)}>
      {children}
    </span>
  );
}

/**
 * The badge keys that every row carries. A badge that every row shares tells the reader nothing,
 * so lists hide these. One row cannot share with another, so it hides nothing.
 */
export function keysSharedByAll(
  rows: readonly (readonly { readonly key: string }[])[],
): ReadonlySet<string> {
  const [first, ...rest] = rows;
  if (first === undefined || rest.length === 0) return new Set();
  const shared = new Set(first.map((badge) => badge.key));
  for (const row of rest) {
    const keys = new Set(row.map((badge) => badge.key));
    for (const key of shared) {
      if (!keys.has(key)) shared.delete(key);
    }
  }
  return shared;
}
