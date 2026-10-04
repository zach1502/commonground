import type { Project } from '../api/web-api';
import { format, messages } from '../messages';
import { pluralise } from '../plural';

export type Deadline = Pick<Project, 'phase' | 'closesAt'>;
export type DateLength = 'long' | 'short';

// closesAt is a calendar day, so it is read and written in UTC and never shifts a day.
const DATE_FORMATS: Readonly<Record<DateLength, Intl.DateTimeFormat>> = {
  long: new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }),
  short: new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', day: 'numeric', month: 'short' }),
};
const DATE_PARTS = ['day', 'month', 'year'] as const;

/**
 * A closing day such as "31 October 2026" or "31 Oct". Intl en-CA gives the names; CONTENT.md
 * puts the day first, so the parts are joined in that order.
 */
export function closingDate(closesAt: string, length: DateLength): string {
  const parts = DATE_FORMATS[length].formatToParts(new Date(`${closesAt}T12:00:00Z`));
  return DATE_PARTS.flatMap((type) => parts.filter((part) => part.type === type))
    .map((part) => part.value)
    .join(' ');
}

/** "Send your design by 31 October 2026.", or "Design closed." once the phase is closed. */
export function deadlineLine({ phase, closesAt }: Deadline): string {
  const text = messages.project.deadline;
  if (phase === 'closed') return text.closed;
  if (closesAt === null) return text.openNoDate;
  return format(text.open, { date: closingDate(closesAt, 'long') });
}

/** The project list line: the design count, then the short closing day while design is open. */
export function projectMeta({ phase, closesAt }: Deadline, count: number): string {
  const designs = pluralise(count, messages.projects.meta);
  if (phase === 'closed' || closesAt === null) return designs;
  return format(messages.projects.closes, { designs, date: closingDate(closesAt, 'short') });
}
