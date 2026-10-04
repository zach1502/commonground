/** The park's time zone, so every reader sees the count time the planners see. */
export const PARK_TIME_ZONE = 'America/Vancouver';

// en-GB writes "26 September 2026" and "3:20 pm", the forms CONTENT.md uses.
const DATE_LOCALE = 'en-GB';

/** "26 September 2026, 3:20 pm" in the given time zone. */
export function formatCountedAt(at: Date, timeZone: string): string {
  const day = new Intl.DateTimeFormat(DATE_LOCALE, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone,
  }).format(at);
  const time = new Intl.DateTimeFormat(DATE_LOCALE, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  }).format(at);
  return `${day}, ${time.replace(/\s/g, ' ')}`;
}

export interface CountedAtProps {
  /** The sentence with a {time} slot, such as "Votes counted to {time}". */
  readonly template: string;
  readonly at: Date;
  readonly timeZone?: string;
}

/** Says when the vote counts on the page were taken. */
export function CountedAt({ template, at, timeZone = PARK_TIME_ZONE }: CountedAtProps) {
  const [before, after = ''] = template.split('{time}');
  return (
    <p className="ps-counted-at">
      {before}
      <time dateTime={at.toISOString()} data-kind="data">
        {formatCountedAt(at, timeZone)}
      </time>
      {after}
    </p>
  );
}
