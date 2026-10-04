import type { ElementComment } from '@parkshape/core';

import type { Design, Project, User, Vote } from '../../ports/records.js';

/** The shared tables behind the in-memory repositories. */
export class InMemoryStore {
  readonly users = new Map<string, User>();
  readonly projects = new Map<string, Project>();
  readonly designs = new Map<string, Design>();
  readonly votes = new Map<string, Vote>();
  readonly elementComments = new Map<string, ElementComment>();
}

/** Orders by a date field, then by id, so equal times still sort the same way every run. */
export function byDateThenId<T extends { readonly id: string }>(
  dateOf: (row: T) => Date | null,
  direction: 'asc' | 'desc',
): (left: T, right: T) => number {
  const sign = direction === 'asc' ? 1 : -1;
  return (left, right) => {
    const difference = (dateOf(left)?.getTime() ?? 0) - (dateOf(right)?.getTime() ?? 0);
    return difference === 0 ? sign * left.id.localeCompare(right.id) : sign * difference;
  };
}
