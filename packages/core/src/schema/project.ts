import { z } from 'zod';

import type { ProjectStatus } from './catalog.js';

/** Design and voting deadlines are days in the park's own time zone. */
export const PARK_TIME_ZONE = 'America/Vancouver';

/** The last day residents can design and vote, as an ISO calendar date such as 2026-10-31. */
export const closesAtSchema = z.iso.date();

/** Whether residents can submit and vote now: staff status and the closing date together. */
export const projectPhaseSchema = z.enum(['open', 'closed']);

export type ProjectPhase = z.infer<typeof projectPhaseSchema>;

export interface PhaseInput {
  readonly status: ProjectStatus;
  readonly closesAt: string | null;
}

// en-CA writes a numeric date as YYYY-MM-DD, so it compares with closesAt as a string.
const PARK_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARK_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Open while staff keep the project open and the park's calendar day is on or before closesAt.
 * The closing day counts in full, so a project closing 2026-10-31 takes votes until midnight.
 */
export function projectPhase(project: PhaseInput, now: Date): ProjectPhase {
  if (project.status === 'closed') return 'closed';
  if (project.closesAt === null) return 'open';
  return PARK_DAY.format(now) > project.closesAt ? 'closed' : 'open';
}
