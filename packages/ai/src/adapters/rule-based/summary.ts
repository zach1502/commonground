import { categorySchema, type Category, type VoteReason } from '@parkshape/core';

import { byRules, type Sourced } from '../../answer-source.js';
import type { SummaryProvider } from '../../ports/summary-provider.js';
import {
  MAX_THEMES,
  MAX_TRADEOFFS,
  MIN_TRADEOFF_DESIGNS,
  type Summary,
  type Theme,
  type Tradeoff,
} from '../../schema/summary.js';
import type { DesignDigest, ReasonCounts, SummaryInput } from '../../types.js';

import { commentLineOf } from './comment-line.js';
import phraseBank from './phrase-bank.json' with { type: 'json' };

// A theme needs at least this many designs behind it, unless fewer designs were given.
const MIN_THEME_DESIGNS = 2;
// A split has two sides, so an even split has leanA at half of chose.
const SPLIT_SIDES = 2;

const REASON_BY_CATEGORY: Readonly<Partial<Record<Category, VoteReason>>> = {
  tree: 'trees',
  play: 'play',
  path: 'paths',
  dog: 'dog-area',
  garden: 'garden',
  water: 'water',
};

const CATEGORY_ORDER = categorySchema.options;
const themeLabels: Readonly<Partial<Record<string, string>>> = phraseBank.themes;
const sideLabels: Readonly<Partial<Record<string, string>>> = phraseBank.sides;

function countOf(design: DesignDigest, category: Category): number {
  return design.categoryCounts[category] ?? 0;
}

function reasonWeight(category: Category, reasons: ReasonCounts): number {
  const reason = REASON_BY_CATEGORY[category];
  return reason === undefined ? 0 : (reasons[reason] ?? 0);
}

/** The design with the most of a category; the higher-ranked one wins a tie. */
function exampleFor(
  designs: readonly DesignDigest[],
  category: Category,
): DesignDigest | undefined {
  return designs.reduce<DesignDigest | undefined>(
    (best, design) =>
      best === undefined || countOf(design, category) > countOf(best, category) ? design : best,
    undefined,
  );
}

interface Candidate {
  readonly category: Category;
  readonly theme: Theme;
  readonly weight: number;
}

function themeCandidate(
  designs: readonly DesignDigest[],
  category: Category,
  reasons: ReasonCounts,
): Candidate[] {
  const label = themeLabels[category];
  const using = designs.filter((design) => countOf(design, category) > 0);
  const example = exampleFor(using, category);
  if (label === undefined || example === undefined) {
    return [];
  }
  const theme = { label, designCount: using.length, exampleDesignId: example.id };
  return [{ category, theme, weight: reasonWeight(category, reasons) }];
}

function compareCandidates(left: Candidate, right: Candidate): number {
  return (
    right.theme.designCount - left.theme.designCount ||
    right.weight - left.weight ||
    CATEGORY_ORDER.indexOf(left.category) - CATEGORY_ORDER.indexOf(right.category)
  );
}

function themesOf(input: SummaryInput): Theme[] {
  const designs = input.topDesigns;
  const minDesigns = Math.min(MIN_THEME_DESIGNS, designs.length);
  return CATEGORY_ORDER.flatMap((category) => themeCandidate(designs, category, input.reasonCounts))
    .filter(({ theme }) => theme.designCount >= minDesigns)
    .sort(compareCandidates)
    .slice(0, MAX_THEMES)
    .map(({ theme }) => theme);
}

interface Split {
  readonly tradeoff: Tradeoff;
}

/** Designs with only one side of a pair; designs with both or neither do not split it. */
function splitOf(designs: readonly DesignDigest[], [a, b]: readonly [Category, Category]): Split[] {
  const aLabel = sideLabels[a];
  const bLabel = sideLabels[b];
  const onlyA = designs.filter((d) => countOf(d, a) > 0 && countOf(d, b) === 0).length;
  const onlyB = designs.filter((d) => countOf(d, b) > 0 && countOf(d, a) === 0).length;
  const chose = onlyA + onlyB;
  // Below the threshold the split is too small to state, so it is left off the page.
  if (aLabel === undefined || bLabel === undefined || chose < MIN_TRADEOFF_DESIGNS) {
    return [];
  }
  return [{ tradeoff: { a: aLabel, b: bLabel, leanA: onlyA, chose } }];
}

/** How lopsided a split is, so the most even split ranks first among equal-sized ones. */
function evenness({ tradeoff }: Split): number {
  return Math.abs(tradeoff.leanA * SPLIT_SIDES - tradeoff.chose);
}

function tradeoffsOf(designs: readonly DesignDigest[]): Tradeoff[] {
  const pairs = phraseBank.pairs.map(
    ([a, b]) => [categorySchema.parse(a), categorySchema.parse(b)] as const,
  );
  return pairs
    .flatMap((pair) => splitOf(designs, pair))
    .sort(
      (left, right) =>
        right.tradeoff.chose - left.tradeoff.chose || evenness(left) - evenness(right),
    )
    .slice(0, MAX_TRADEOFFS)
    .map(({ tradeoff }) => tradeoff);
}

/** Themes from the categories most top designs share; tradeoffs from pairs that split them. */
export class RuleBasedSummaryProvider implements SummaryProvider {
  summarize(input: SummaryInput): Promise<Sourced<Summary>> {
    return Promise.resolve(
      byRules({
        themes: themesOf(input),
        tradeoffs: tradeoffsOf(input.topDesigns),
        ...commentLineOf(input.elementFeedback),
      }),
    );
  }
}
