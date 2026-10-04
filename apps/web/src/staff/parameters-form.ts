import {
  categorySchema,
  CONSTRAINT_KEYS,
  projectParametersSchema,
  type ConstraintKey,
  type ProjectParameters,
  type ProjectParametersInput,
} from '@parkshape/core';

const PERCENT = 100;

export type Category = (typeof categorySchema.options)[number];
export type Severity = 'soft' | 'hard';

interface NumberRule {
  readonly min: number;
  readonly max?: number;
  /** 'above' means the value must be greater than min, not equal to it. */
  readonly bound?: 'above' | 'from';
  readonly whole?: 'whole';
  readonly need?: 'optional';
}

export const NUMBER_RULES = {
  budgetTotal: { min: 0 },
  cutPerM3: { min: 0 },
  fillPerM3: { min: 0 },
  haulPerM3: { min: 0 },
  canopyMin: { min: 0, max: PERCENT },
  imperviousMax: { min: 0, max: PERCENT },
  gardenMinPlots: { min: 1, whole: 'whole' },
  maxRunningSlope: { min: 0, max: PERCENT },
  maxCrossSlope: { min: 0, max: PERCENT },
  maxDeviationM: { min: 0, bound: 'above' },
  maxNetHaulM3: { min: 0, need: 'optional' },
  maxDisturbedPercent: { min: 0, max: PERCENT, need: 'optional' },
  rootZonePerDbhCm: { min: 0, bound: 'above' },
  priorUp: { min: 0, bound: 'above' },
  priorDown: { min: 0, bound: 'above' },
} as const satisfies Record<string, NumberRule>;

export type NumberFieldId = keyof typeof NUMBER_RULES;
export const NUMBER_FIELD_IDS = Object.keys(NUMBER_RULES) as NumberFieldId[];
export const CATEGORIES: readonly Category[] = categorySchema.options;

export interface CountDraft {
  readonly min: string;
  readonly max: string;
}

/** What the planner has typed, kept as text so a half-typed value survives going back. */
export interface ParametersDraft {
  readonly numbers: Readonly<Record<NumberFieldId, string>>;
  readonly counts: Readonly<Record<Category, CountDraft>>;
  readonly severity: Readonly<Record<ConstraintKey, Severity>>;
  readonly brief: string;
}

export interface FormMessages {
  readonly notNumber: string;
  readonly required: string;
  readonly whole: string;
  /** Has {min}. */
  readonly atLeast: string;
  /** Has {min}. */
  readonly above: string;
  /** Has {min} and {max}. */
  readonly between: string;
  readonly minAboveMax: string;
}

export type FieldErrors = Readonly<Record<string, string>>;
export type DraftResult =
  | { readonly kind: 'valid'; readonly parameters: ProjectParameters }
  | { readonly kind: 'invalid'; readonly errors: FieldErrors };

const toText = (value: number | undefined) => (value === undefined ? '' : String(value));

/** Fields that hold dollars; the form writes them with thousands separators. */
export const MONEY_FIELDS: readonly NumberFieldId[] = [
  'budgetTotal',
  'cutPerM3',
  'fillPerM3',
  'haulPerM3',
];

const WHOLE_DIGITS = /^\d+$/;
const MONEY_LOCALE = 'en-CA';

/** Whole dollars with thousands separators, such as "1,200,000"; other text stays as typed. */
export function moneyText(text: string): string {
  const bare = text.replace(/,/g, '').trim();
  return WHOLE_DIGITS.test(bare) ? Number(bare).toLocaleString(MONEY_LOCALE) : text;
}
const asPercent = (slope: number) => String(Math.round(slope * PERCENT * PERCENT) / PERCENT);

function gardenPlots(parameters: ProjectParameters): number | undefined {
  const garden = parameters.requiredFeatures.find(
    (feature) => 'category' in feature && feature.category === 'garden',
  );
  return garden?.minPlots;
}

function numbersFrom(p: ProjectParameters): Record<NumberFieldId, string> {
  return {
    budgetTotal: moneyText(toText(p.budget.totalCad)),
    cutPerM3: moneyText(toText(p.budget.earthworks.cutPerM3)),
    fillPerM3: moneyText(toText(p.budget.earthworks.fillPerM3)),
    haulPerM3: moneyText(toText(p.budget.earthworks.haulPerM3)),
    canopyMin: toText(p.canopy.minPercent),
    imperviousMax: toText(p.impervious.maxPercent),
    gardenMinPlots: toText(gardenPlots(p)),
    maxRunningSlope: asPercent(p.slopes.maxRunning),
    maxCrossSlope: asPercent(p.slopes.maxCross),
    maxDeviationM: toText(p.terraform.maxDeviationM),
    maxNetHaulM3: toText(p.terraform.maxNetHaulM3),
    maxDisturbedPercent: toText(p.terraform.maxDisturbedPercent),
    rootZonePerDbhCm: toText(p.treeProtection.rootZonePerDbhCm),
    priorUp: toText(p.scoringPrior.up),
    priorDown: toText(p.scoringPrior.down),
  };
}

/** The form's starting text for a set of parameters, such as core defaultParameters(). */
export function draftFrom(parameters: ProjectParameters): ParametersDraft {
  const counts = Object.fromEntries(
    CATEGORIES.map((category) => {
      const range = parameters.counts.find((entry) => entry.category === category);
      return [category, { min: toText(range?.min), max: toText(range?.max) }];
    }),
  ) as Record<Category, CountDraft>;
  const severity = Object.fromEntries(
    CONSTRAINT_KEYS.map((key) => [key, parameters.severity[key]]),
  ) as Record<ConstraintKey, Severity>;
  return { numbers: numbersFrom(parameters), counts, severity, brief: parameters.brief };
}

const fill = (template: string, values: Readonly<Record<string, number>>) =>
  template.replace(/\{(\w+)\}/g, (slot, key: string) => String(values[key] ?? slot));

type Parsed = { readonly value: number | undefined } | { readonly error: string };

function rangeError(value: number, rule: NumberRule, messages: FormMessages): string | null {
  if (rule.whole === 'whole' && !Number.isInteger(value)) return messages.whole;
  const low = rule.bound === 'above' ? value <= rule.min : value < rule.min;
  const high = rule.max !== undefined && value > rule.max;
  if (!low && !high) return null;
  if (rule.max !== undefined) return fill(messages.between, { min: rule.min, max: rule.max });
  return fill(rule.bound === 'above' ? messages.above : messages.atLeast, { min: rule.min });
}

function parseNumber(text: string, rule: NumberRule, messages: FormMessages): Parsed {
  // Money may carry a "$" and thousands separators.
  const trimmed = text.trim().replace(/^\$/, '').replace(/,/g, '');
  if (trimmed === '')
    return rule.need === 'optional' ? { value: undefined } : { error: messages.required };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { error: messages.notNumber };
  const error = rangeError(value, rule, messages);
  return error === null ? { value } : { error };
}

const COUNT_RULE: NumberRule = { min: 0, whole: 'whole', need: 'optional' };

type Errors = Record<string, string>;
type CountRange = ProjectParametersInput['counts'][number];

function countRange(
  category: Category,
  text: CountDraft,
  context: { messages: FormMessages; errors: Errors },
): CountRange | null {
  const { messages, errors } = context;
  const min = parseNumber(text.min, COUNT_RULE, messages);
  const max = parseNumber(text.max, COUNT_RULE, messages);
  if ('error' in min) errors[`count-${category}-min`] = min.error;
  if ('error' in max) errors[`count-${category}-max`] = max.error;
  if ('error' in min || 'error' in max) return null;
  if (min.value !== undefined && max.value !== undefined && min.value > max.value) {
    errors[`count-${category}-max`] = messages.minAboveMax;
    return null;
  }
  if (min.value === undefined && max.value === undefined) return null;
  return { category, ...optional('min', min.value), ...optional('max', max.value) };
}

function parseCounts(draft: ParametersDraft, messages: FormMessages, errors: Errors): CountRange[] {
  return CATEGORIES.flatMap((category) => {
    const range = countRange(category, draft.counts[category], { messages, errors });
    return range === null ? [] : [range];
  });
}

function parseNumbers(
  draft: ParametersDraft,
  messages: FormMessages,
  errors: Record<string, string>,
) {
  const values: Partial<Record<NumberFieldId, number>> = {};
  NUMBER_FIELD_IDS.forEach((id) => {
    const parsed = parseNumber(draft.numbers[id], NUMBER_RULES[id], messages);
    if ('error' in parsed) errors[id] = parsed.error;
    else if (parsed.value !== undefined) values[id] = parsed.value;
  });
  return values;
}

type Values = Partial<Record<NumberFieldId, number>>;

function optional(key: string, value: number | undefined): Record<string, number> {
  return value === undefined ? {} : { [key]: value };
}

function assemble(
  values: Values,
  draft: ParametersDraft,
  base: ProjectParameters,
  counts: ProjectParametersInput['counts'],
): ProjectParametersInput {
  // Every required field passed its check, so a missing value only means an optional one.
  const at = (id: NumberFieldId) => values[id] ?? 0;
  const others = base.requiredFeatures.filter(
    (feature) => !('category' in feature) || feature.category !== 'garden',
  );
  return {
    ...base,
    budget: {
      totalCad: at('budgetTotal'),
      earthworks: {
        cutPerM3: at('cutPerM3'),
        fillPerM3: at('fillPerM3'),
        haulPerM3: at('haulPerM3'),
      },
    },
    canopy: { minPercent: at('canopyMin') },
    impervious: { maxPercent: at('imperviousMax') },
    requiredFeatures: [
      ...others,
      { category: 'garden', minCount: 1, minPlots: at('gardenMinPlots') },
    ],
    slopes: {
      maxRunning: at('maxRunningSlope') / PERCENT,
      maxCross: at('maxCrossSlope') / PERCENT,
    },
    counts,
    terraform: {
      maxDeviationM: at('maxDeviationM'),
      ...optional('maxNetHaulM3', values.maxNetHaulM3),
      ...optional('maxDisturbedPercent', values.maxDisturbedPercent),
    },
    treeProtection: { rootZonePerDbhCm: at('rootZonePerDbhCm') },
    brief: draft.brief.trim(),
    scoringPrior: { up: at('priorUp'), down: at('priorDown') },
    severity: { ...draft.severity },
  };
}

/** Checks every field and builds the parameters, or says what is wrong next to each field. */
export function parseDraft(
  draft: ParametersDraft,
  base: ProjectParameters,
  messages: FormMessages,
): DraftResult {
  const errors: Record<string, string> = {};
  const values = parseNumbers(draft, messages, errors);
  const counts = parseCounts(draft, messages, errors);
  if (draft.brief.trim() === '') errors.brief = messages.required;
  if (Object.keys(errors).length > 0) return { kind: 'invalid', errors };
  const parsed = projectParametersSchema.safeParse(assemble(values, draft, base, counts));
  return parsed.success
    ? { kind: 'valid', parameters: parsed.data }
    : { kind: 'invalid', errors: { form: parsed.error.issues[0]?.message ?? messages.required } };
}
