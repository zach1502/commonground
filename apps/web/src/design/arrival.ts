import type { DesignArrival } from './design-details';

/** The history state the editor sends with its navigation after a submit. */
export const SUBMITTED_ARRIVAL = { arrival: 'submitted' } as const;

/** How the visitor reached the design page, read from untrusted history state. */
export function arrivalFrom(state: unknown): DesignArrival {
  if (typeof state !== 'object' || state === null) return 'visit';
  return 'arrival' in state && state.arrival === SUBMITTED_ARRIVAL.arrival ? 'submitted' : 'visit';
}
