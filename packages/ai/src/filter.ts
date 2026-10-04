import rules from './content/content-rules.json' with { type: 'json' };
import type { Intent, IntentFeature, Placement } from './schema/intent.js';
import type { Summary, Theme, Tradeoff } from './schema/summary.js';

/**
 * Every string a provider returns passes through here. The word list is a copy of
 * tools/preflight/content-rules.json (packages may not import tools); a test keeps it in sync.
 */

// A plain word for each banned word we can swap; an empty string removes a filler word.
// Banned phrases missing here, such as "tapestry", make the whole item drop.
const PLAIN_WORDS: Readonly<Record<string, string>> = {
  additionally: '',
  'align with': 'match',
  bolster: 'support',
  crucial: 'important',
  elevate: 'raise',
  empower: 'help',
  emphasize: 'stress',
  enhance: 'improve',
  ensure: 'make sure',
  foster: 'build',
  garner: 'get',
  intricate: 'detailed',
  leverage: 'use',
  meticulous: 'careful',
  overall: '',
  pivotal: 'important',
  robust: 'strong',
  seamless: 'smooth',
  showcase: 'show',
  streamline: 'simplify',
  underscore: 'show',
  unlock: 'open',
  vibrant: '',
  'serves as': 'is',
  'stands as': 'is',
  'refers to': 'means',
};

const FIXES: readonly (readonly [RegExp, string])[] = [
  [/\s*\u2014\s*/g, ', '],
  [/\s\u2013\s/g, ', '],
  [/[\u2018\u2019]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/\p{Extended_Pictographic}\uFE0F?/gu, ''],
];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const bannedWords = rules.banned.map((word) => ({
  word,
  re: new RegExp(`\\b${escapeRegExp(word)}\\b`, 'giu'),
}));

const proseChecks = rules.patterns
  .filter((pattern) => pattern.scope === 'all')
  .map((pattern) => ({ id: pattern.id, re: new RegExp(pattern.regex, pattern.flags) }));

function matches(re: RegExp, text: string): boolean {
  re.lastIndex = 0;
  const found = re.test(text);
  re.lastIndex = 0;
  return found;
}

/** The content rules a string breaks, as short messages; empty when it is clean. */
export function contentProblems(text: string): string[] {
  return [
    ...bannedWords.filter(({ re }) => matches(re, text)).map(({ word }) => `banned word "${word}"`),
    ...proseChecks.filter(({ re }) => matches(re, text)).map(({ id }) => `pattern ${id}`),
  ];
}

function matchCase(replacement: string, original: string): string {
  const first = original.charAt(0);
  const isCapital = first !== first.toLowerCase();
  return isCapital ? replacement.charAt(0).toUpperCase() + replacement.slice(1) : replacement;
}

function swapBannedWords(text: string): string {
  return bannedWords.reduce((current, { word, re }) => {
    const plain = PLAIN_WORDS[word];
    return plain === undefined ? current : current.replace(re, (found) => matchCase(plain, found));
  }, text);
}

function tidy(text: string, original: string): string {
  const spaced = text
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,;:]+|[\s,;:]+$/g, '');
  return matchCase(spaced, original);
}

/** Text with banned words swapped and fixable patterns fixed, or undefined to drop the item. */
export function cleanText(text: string): string | undefined {
  const fixed = FIXES.reduce(
    (current, [re, replacement]) => current.replace(re, replacement),
    text,
  );
  const cleaned = tidy(swapBannedWords(fixed), text);
  if (cleaned === '' || contentProblems(cleaned).length > 0) {
    return undefined;
  }
  return cleaned;
}

function cleanTheme(theme: Theme): Theme[] {
  const label = cleanText(theme.label);
  return label === undefined ? [] : [{ ...theme, label }];
}

function cleanTradeoff(tradeoff: Tradeoff): Tradeoff[] {
  const a = cleanText(tradeoff.a);
  const b = cleanText(tradeoff.b);
  return a === undefined || b === undefined ? [] : [{ ...tradeoff, a, b }];
}

function cleanCommentLine(line: string | undefined): Pick<Summary, 'commentLine'> {
  const cleaned = line === undefined ? undefined : cleanText(line);
  return cleaned === undefined ? {} : { commentLine: cleaned };
}

/** The summary with every label cleaned; items that cannot be cleaned drop. */
export function filterSummary(summary: Summary): Summary {
  return {
    themes: summary.themes.flatMap(cleanTheme),
    tradeoffs: summary.tradeoffs.flatMap(cleanTradeoff),
    ...cleanCommentLine(summary.commentLine),
  };
}

function cleanPlaceName(key: 'near' | 'awayFrom', value: string | undefined): Placement {
  const cleaned = value === undefined ? undefined : cleanText(value);
  return cleaned === undefined ? {} : { [key]: cleaned };
}

function cleanPlacement(placement: Placement): Placement {
  const { near, awayFrom, ...fixed } = placement;
  return { ...fixed, ...cleanPlaceName('near', near), ...cleanPlaceName('awayFrom', awayFrom) };
}

function cleanFeature(feature: IntentFeature): IntentFeature {
  const { placement, ...rest } = feature;
  if (placement === undefined) {
    return feature;
  }
  const cleaned = cleanPlacement(placement);
  return Object.keys(cleaned).length === 0 ? rest : { ...rest, placement: cleaned };
}

/** The intent with free-text place names cleaned; names that cannot be cleaned are removed. */
export function filterIntent(intent: Intent): Intent {
  return { ...intent, features: intent.features.map(cleanFeature) };
}
