import type { ProjectSummary } from '../../api/staff-api';

type Theme = ProjectSummary['themes'][number];

/** One line of the themes list: themes that share a count read as one joined label. */
export interface ThemeRow {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  /** 'every' when the count is the whole top list, so the row says so once. */
  readonly every: 'every' | 'some';
}

const LIST = new Intl.ListFormat('en-CA', { style: 'long', type: 'conjunction' });
const ACRONYM = /^\p{Lu}{2}/u;

/** Lowers the first letter of a label that sits inside a sentence; acronyms keep their case. */
export function midSentence(label: string): string {
  if (ACRONYM.test(label)) return label;
  return label.charAt(0).toLocaleLowerCase('en-CA') + label.slice(1);
}

function joinLabels(labels: readonly string[]): string {
  const [first = '', ...rest] = labels;
  return LIST.format([first, ...rest.map(midSentence)]);
}

/**
 * Themes found in every top design collapse into one row, so the page says "in every top
 * design" once. Every other theme keeps its own row and count.
 */
export function themeRows(themes: readonly Theme[], total: number): ThemeRow[] {
  const inAll = themes.filter((theme) => theme.designCount === total && total > 0);
  const rest = themes.filter((theme) => !inAll.includes(theme));
  const first = inAll[0];
  const joined: ThemeRow[] =
    first === undefined
      ? []
      : [
          {
            key: first.label,
            label: joinLabels(inAll.map((theme) => theme.label)),
            count: total,
            every: 'every',
          },
        ];
  return [
    ...joined,
    ...rest.map((theme) => ({
      key: theme.label,
      label: theme.label,
      count: theme.designCount,
      every: 'some' as const,
    })),
  ];
}
