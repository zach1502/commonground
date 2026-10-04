import { format } from './messages';

/** A message with one form for a count of 1 and one for every other count, as English needs. */
export interface PluralForms {
  readonly one: string;
  readonly other: string;
}

const RULES = new Intl.PluralRules('en-CA');

/** Picks the plural form for `count` with Intl.PluralRules and fills {count} and other slots. */
export function pluralise(
  count: number,
  forms: PluralForms,
  values: Readonly<Record<string, string | number>> = {},
): string {
  const form = RULES.select(count) === 'one' ? forms.one : forms.other;
  return format(form, { ...values, count });
}
