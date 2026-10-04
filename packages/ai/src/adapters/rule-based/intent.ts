import { clamp } from '@parkshape/core';

import { byRules, type Sourced } from '../../answer-source.js';
import type { IntentProvider } from '../../ports/intent-provider.js';
import {
  MAX_FEATURE_COUNT,
  MAX_FEATURES,
  type Intent,
  type IntentFeature,
  type Placement,
} from '../../schema/intent.js';

import {
  normalize,
  readCanopy,
  readCharacter,
  readPaths,
  readPlacement,
  readQuantity,
  readSize,
  splitClauses,
} from './intent-reading.js';
import { FEATURE_TERMS, PLURAL_COUNT, type FeatureTerm } from './intent-vocabulary.js';

// Phrases that end in "s" but name one item.
const ONE_ITEM_PHRASES = new Set(['swings']);

interface FoundTerm {
  readonly term: FeatureTerm;
  readonly index: number;
  readonly count: 'one' | 'several';
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const TERM_PATTERNS = FEATURE_TERMS.map((term) => ({
  term,
  re: new RegExp(`(?<![\\w-])${escapeRegExp(term.phrase)}(es|s)?(?![\\w-])`, 'g'),
}));

function countKind(term: FeatureTerm, suffix: string | undefined): FoundTerm['count'] {
  const plural = suffix !== undefined || term.phrase.endsWith('s');
  return plural && !ONE_ITEM_PHRASES.has(term.phrase) ? 'several' : 'one';
}

/** Feature names in a clause, longest first; each match blanks its text so it counts once. */
function findTerms(clause: string): FoundTerm[] {
  let remaining = clause;
  const found: FoundTerm[] = [];
  for (const { term, re } of TERM_PATTERNS) {
    remaining = remaining.replace(
      re,
      (match: string, suffix: string | undefined, index: number) => {
        found.push({ term, index, count: countKind(term, suffix) });
        return ' '.repeat(match.length);
      },
    );
  }
  return found.sort((left, right) => left.index - right.index);
}

function featureOf(found: FoundTerm, prefix: string, extras: FeatureExtras): IntentFeature {
  const fallback = found.count === 'several' ? PLURAL_COUNT : 1;
  const count = clamp(readQuantity(prefix) ?? fallback, 1, MAX_FEATURE_COUNT);
  const { catalogId, category } = found.term;
  return {
    ...(catalogId === undefined ? {} : { catalogId }),
    category,
    count,
    ...(extras.size === undefined ? {} : { size: extras.size }),
    ...(Object.keys(extras.placement).length === 0 ? {} : { placement: extras.placement }),
  };
}

interface FeatureExtras {
  readonly size: IntentFeature['size'];
  readonly placement: Placement;
}

function featuresOf(clause: string): IntentFeature[] {
  const { placement, rest } = readPlacement(clause);
  const extras = { size: readSize(rest), placement };
  let start = 0;
  return findTerms(rest).map((found) => {
    const feature = featureOf(found, rest.slice(start, found.index), extras);
    start = found.index + found.term.phrase.length;
    return feature;
  });
}

/** Reads a description with keyword and pattern matching against catalog names and synonyms. */
export class RuleBasedIntentProvider implements IntentProvider {
  parse(text: string): Promise<Sourced<Intent>> {
    const normalized = normalize(text);
    const features = splitClauses(normalized).flatMap(featuresOf).slice(0, MAX_FEATURES);
    const hasTrees = features.some((feature) => feature.category === 'tree') ? 'yes' : 'no';
    const canopy = readCanopy(normalized, { hasTrees });
    return Promise.resolve(
      byRules({
        features,
        paths: readPaths(normalized),
        canopy,
        character: readCharacter(normalized, canopy),
      }),
    );
  }
}
