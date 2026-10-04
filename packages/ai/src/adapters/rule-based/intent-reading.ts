import type {
  Canopy,
  Character,
  FeatureSize,
  PathStyle,
  Placement,
  TerrainPreference,
} from '../../schema/intent.js';
import { MAX_PLACE_NAME_CHARS } from '../../schema/intent.js';

import { QUANTITY_WORDS, ZONE_WORDS } from './intent-vocabulary.js';

type PathSurface = 'asphalt' | 'gravel' | 'boardwalk';

const MAX_PLACE_WORDS = 3;
const CLAUSE_BREAK = /[,;.!?]|\b(?:and|with|plus|then)\b/;
const ARTICLE = /^(?:the|a|an|our|my)\s+/;
const PLACE_STOP = /^(?:on|in|at|by|along|away|near|for|to|from|of|so|that|where)$/;
const NEAR = /\b(?:near|next to|beside|close to|by)\s+(.+)$/;
const AWAY_FROM = /\b(?:away from|far from)\s+(.+)$/;

const TERRAIN_WORDS: readonly (readonly [RegExp, TerrainPreference])[] = [
  [/\b(?:low(?:est)?|bottom|dip|hollow)\b/, 'low'],
  [/\b(?:high(?:est)?|hill(?:top)?|top of|ridge)\b/, 'high'],
  [/\b(?:flat|level)\b/, 'flat'],
  [/\b(?:edges?|perimeter|border|along the (?:fence|street|side))\b/, 'edge'],
];

const SIZE_WORDS: readonly (readonly [RegExp, FeatureSize])[] = [
  [/\b(?:small|little|tiny|mini)\b/, 'small'],
  [/\b(?:medium|mid-sized)\b/, 'medium'],
  [/\b(?:big|large|huge|giant)\b/, 'large'],
];

const PATH_STYLES: readonly (readonly [RegExp, PathStyle])[] = [
  [/\b(?:loop\w*|circuit|round trip)\b/, 'loop'],
  [/\b(?:minimal|fewer paths|few paths|no paths|less paving)\b/, 'minimal'],
  [/\b(?:connect\w*|link\w*|everywhere)\b/, 'connect-all'],
];

const SURFACES: readonly (readonly [RegExp, PathSurface])[] = [
  [/\bgravel\b/, 'gravel'],
  [/\bboardwalks?\b/, 'boardwalk'],
  [/\b(?:asphalt|paved|pavement)\b/, 'asphalt'],
];

const MAXIMIZE_CANOPY =
  /\b(?:lots of|loads of|plenty of|many|more|maximi[sz]e|dense)\s+(?:\w+\s+)?(?:trees|shade|canopy)\b|\b(?:forest|woods?|shady|orchard)\b/;
const ADD_CANOPY = /\b(?:some|a few|few|add|new|plant)\s+(?:\w+\s+)?trees?\b/;

const CHARACTER_WORDS: readonly (readonly [RegExp, Character])[] = [
  [/\b(?:natural|native|wild\w*|meadow|forest|woods?|quiet|nature)\b/g, 'natural'],
  [/\b(?:active|sports?|play\w*|courts?|fitness|basketball|tennis|swings?|dog)\b/g, 'active'],
  [/\b(?:open|lawn|grass|picnic\w*|field)\b/g, 'open-lawn'],
];

function firstMatch<T>(text: string, table: readonly (readonly [RegExp, T])[]): T | undefined {
  return table.find(([re]) => re.test(text))?.[1];
}

/** Lowercase text with straight quotes and single spaces. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

export function splitClauses(text: string): string[] {
  return text
    .split(CLAUSE_BREAK)
    .map((clause) => clause.trim())
    .filter((clause) => clause !== '');
}

/** The first few words after "near the" or "away from", stopping at the next preposition. */
function placeName(rest: string): string | undefined {
  const words = rest.replace(ARTICLE, '').split(' ');
  const stop = words.findIndex((word) => PLACE_STOP.test(word));
  const kept = words.slice(0, stop === -1 ? MAX_PLACE_WORDS : Math.min(stop, MAX_PLACE_WORDS));
  const name = kept
    .join(' ')
    .replace(/[^\w\s-]/g, '')
    .trim();
  return name === '' ? undefined : name.slice(0, MAX_PLACE_NAME_CHARS);
}

export interface ClausePlacement {
  readonly placement: Placement;
  /** The clause with the "near ..." and "away from ..." parts cut, so they add no features. */
  readonly rest: string;
}

function cutRelation(text: string, re: RegExp): { name?: string; rest: string } {
  const match = re.exec(text);
  if (match === null) {
    return { rest: text };
  }
  const name = placeName(match[1] ?? '');
  const rest = text.slice(0, match.index).trim();
  return name === undefined ? { rest } : { name, rest };
}

export function readPlacement(clause: string): ClausePlacement {
  const away = cutRelation(clause, AWAY_FROM);
  const near = cutRelation(away.rest, NEAR);
  const zone = firstMatch(near.rest, ZONE_WORDS);
  const terrain = firstMatch(near.rest, TERRAIN_WORDS);
  const placement: Placement = {
    ...(zone === undefined ? {} : { zone }),
    ...(near.name === undefined ? {} : { near: near.name }),
    ...(away.name === undefined ? {} : { awayFrom: away.name }),
    ...(terrain === undefined ? {} : { terrain }),
  };
  return { placement, rest: near.rest };
}

export function readSize(clause: string): FeatureSize | undefined {
  return firstMatch(clause, SIZE_WORDS);
}

const QUANTITY_PATTERN = new RegExp(
  `\\b(\\d+|${Object.keys(QUANTITY_WORDS)
    .sort((left, right) => right.length - left.length)
    .join('|')})\\b`,
  'g',
);

/** The last count word before a feature name, such as "two" in "two small benches". */
export function readQuantity(prefix: string): number | undefined {
  const found = [...prefix.matchAll(QUANTITY_PATTERN)].at(-1)?.[1];
  if (found === undefined) {
    return undefined;
  }
  return QUANTITY_WORDS[found] ?? Number.parseInt(found, 10);
}

export function readPaths(text: string): { style: PathStyle; surface?: PathSurface } {
  const style = firstMatch(text, PATH_STYLES) ?? 'connect-all';
  const surface = firstMatch(text, SURFACES);
  return surface === undefined ? { style } : { style, surface };
}

export function readCanopy(text: string, options: { hasTrees: 'yes' | 'no' }): Canopy {
  if (MAXIMIZE_CANOPY.test(text)) return 'maximize';
  if (ADD_CANOPY.test(text) || options.hasTrees === 'yes') return 'add-some';
  return 'keep-existing';
}

/** The character with the most matching words; shade tips a tie toward natural. */
export function readCharacter(text: string, canopy: Canopy): Character {
  const scores = CHARACTER_WORDS.map(([re, character]) => ({
    character,
    score:
      (text.match(re)?.length ?? 0) + (character === 'natural' && canopy === 'maximize' ? 1 : 0),
  }));
  const best = scores.reduce((top, entry) => (entry.score > top.score ? entry : top));
  return best.score === 0 ? 'open-lawn' : best.character;
}
