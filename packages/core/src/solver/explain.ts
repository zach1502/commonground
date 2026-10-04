import { formatPercentValue, plural } from '../metrics/format.js';

import type { Hint } from './hints.js';
import type { CompassZone, TerrainPreference } from './intent.js';

/** Something about a generated layout the resident should know. */
export type LayoutNote =
  | {
      readonly kind: 'hintMissed';
      readonly name: string;
      readonly hint: Hint;
      readonly zone: CompassZone;
    }
  | { readonly kind: 'placeMissing'; readonly name: string; readonly place: string }
  | { readonly kind: 'notPlaced'; readonly name: string; readonly count: number }
  | { readonly kind: 'stayed'; readonly name: string }
  | { readonly kind: 'unreached'; readonly name: string }
  | { readonly kind: 'canopyShort'; readonly percent: number; readonly target: number }
  | { readonly kind: 'added'; readonly name: string }
  | { readonly kind: 'enlarged'; readonly name: string; readonly plots: number }
  | { readonly kind: 'stillFailing'; readonly message: string };

const TERRAIN_PHRASES: Readonly<Record<TerrainPreference, string>> = {
  flat: 'on flat ground',
  low: 'on the low side',
  high: 'on the high ground',
  edge: 'along the edge',
};
const LEADING_THE = /^the\s+/i;
const STARTS_WITH_VOWEL = /^[aeiou]/i;

function lowerFirst(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

/** "near the north edge", "in the north-east corner" or "in the centre". */
export function zonePhrase(zone: CompassZone): string {
  if (zone === 'centre') return 'in the centre';
  return zone.includes('-') ? `in the ${zone} corner` : `near the ${zone} edge`;
}

function hintPhrase(hint: Hint): string {
  switch (hint.kind) {
    case 'zone':
      return zonePhrase(hint.zone);
    case 'terrain':
      return TERRAIN_PHRASES[hint.terrain];
    case 'near':
      return `near ${hint.place}`;
    case 'awayFrom':
      return `away from ${hint.place}`;
  }
}

function article(name: string): string {
  return STARTS_WITH_VOWEL.test(name) ? 'An' : 'A';
}

function notPlacedNote(name: string, count: number): string {
  return count === 1
    ? `The ${lowerFirst(name)} did not fit in the park. Try a smaller size in the editor.`
    : `${plural(count, `${lowerFirst(name)} item`)} did not fit in the park. Try fewer in the editor.`;
}

/** One or two plain sentences, fact then action, per CONTENT.md. */
export function explainNote(note: LayoutNote): string {
  switch (note.kind) {
    case 'hintMissed':
      return `The ${lowerFirst(note.name)} did not fit ${hintPhrase(note.hint)}. It is ${zonePhrase(note.zone)} instead.`;
    case 'placeMissing':
      return `The park has no ${note.place.replace(LEADING_THE, '')}, so the ${lowerFirst(note.name)} goes where it fits best.`;
    case 'notPlaced':
      return notPlacedNote(note.name, note.count);
    case 'stayed':
      return `The ${lowerFirst(note.name)} did not fit where you asked. It stays where it is now.`;
    case 'unreached':
      return `No path reaches the ${lowerFirst(note.name)}. Draw one in the editor.`;
    case 'canopyShort':
      return `Trees cover ${formatPercentValue(note.percent)} of the park, short of the ${formatPercentValue(note.target)} goal. There was no room for more trees.`;
    case 'added':
      return `${article(note.name)} ${lowerFirst(note.name)} was added because the project needs one.`;
    case 'enlarged':
      return `The ${lowerFirst(note.name)} was made larger to fit ${plural(note.plots, 'plot')}.`;
    case 'stillFailing':
      return note.message;
  }
}
