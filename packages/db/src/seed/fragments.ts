import { z } from 'zod';

import { pathStyleSchema, type PathStyle } from '@parkshape/core';

import { readSeedJson } from './seed-files.js';

/** The idea a seeded design leads with; picks its title and its opening sentence. */
export const LEAD_TAGS = ['dog', 'play', 'water', 'garden', 'trees', 'open'] as const;
export type LeadTag = (typeof LEAD_TAGS)[number];
/** Tags also name what voters liked; `paths` has reasons but no title fragments. */
export type SeedTag = LeadTag | 'paths';

const leadTagSchema = z.enum(LEAD_TAGS);
const fragmentList = z.array(z.string().min(1)).min(1);

export const fragmentBankSchema = z.object({
  titleLeads: z.record(leadTagSchema, fragmentList),
  titleTails: z.record(pathStyleSchema, fragmentList),
  openers: z.record(leadTagSchema, fragmentList),
  details: fragmentList,
});

export type FragmentBank = z.output<typeof fragmentBankSchema>;

/** Numbers read from a solved design that fill the slots in the detail fragments. */
export interface DesignFacts {
  readonly lockedTrees: number;
  readonly newTrees: number;
  readonly plots: number;
  readonly costCad: number;
  readonly pathM: number;
}

export interface TitleParts {
  readonly lead: LeadTag;
  readonly pathStyle: PathStyle;
  readonly variant: number;
}

export interface BlurbParts {
  readonly lead: LeadTag;
  readonly variant: number;
  readonly facts: DesignFacts;
}

const SLOT = /\{(\w+)\}/g;
const COST_ROUNDING_CAD = 1000;
const costFormat = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  maximumFractionDigits: 0,
});

/** The fragment bank in packages/db/seed/fragments.json. */
export function loadFragmentBank(): FragmentBank {
  return fragmentBankSchema.parse(readSeedJson('fragments.json'));
}

function pick(list: readonly string[], index: number): string {
  return list[index % list.length] ?? '';
}

interface SlotValue {
  readonly amount: number;
  readonly text: string;
}

function slotValues(facts: DesignFacts): Readonly<Record<string, SlotValue>> {
  const count = (amount: number) => ({ amount, text: String(amount) });
  const cost = Math.round(facts.costCad / COST_ROUNDING_CAD) * COST_ROUNDING_CAD;
  return {
    lockedTrees: count(facts.lockedTrees),
    newTrees: count(facts.newTrees),
    plots: count(facts.plots),
    pathM: count(Math.round(facts.pathM)),
    cost: { amount: cost, text: costFormat.format(cost) },
  };
}

/** Fills a detail's slots, or returns undefined when a slot would read as 0 or is unknown. */
export function fillDetail(detail: string, facts: DesignFacts): string | undefined {
  const values = slotValues(facts);
  const slots = [...detail.matchAll(SLOT)].map((match) => values[match[1] ?? '']);
  if (slots.some((value) => value === undefined || value.amount === 0)) return undefined;
  return detail.replace(SLOT, (_, slot: string) => values[slot]?.text ?? '');
}

/** A title such as "Dog run on a loop", from the lead idea and the path style. */
export function composeTitle(bank: FragmentBank, parts: TitleParts): string {
  const lead = pick(bank.titleLeads[parts.lead], parts.variant);
  return `${lead} ${pick(bank.titleTails[parts.pathStyle], parts.variant)}`;
}

/** Two first-person sentences: the lead idea, then one detail with a number from the design. */
export function composeBlurb(bank: FragmentBank, parts: BlurbParts): string {
  const opener = pick(bank.openers[parts.lead], parts.variant);
  const details = bank.details.map((_, offset) =>
    fillDetail(pick(bank.details, parts.variant + offset), parts.facts),
  );
  const detail = details.find((text) => text !== undefined);
  return detail === undefined ? opener : `${opener} ${detail}`;
}
