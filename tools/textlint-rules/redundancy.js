import { readFileSync } from 'node:fs';

/**
 * Detects help text that repeats its label and strings that open by narrating a control.
 * The word lists come from the `redundancy` block of tools/preflight/content-rules.json,
 * so docs and preflight name one source. See CONTENT.md#do-not-explain-the-obvious.
 */

const RULES_URL = new URL('../preflight/content-rules.json', import.meta.url);
const MIN_WORD_LENGTH = 2;
const MIN_STEM_LENGTH = 3;

// Function words that carry no content, dropped before the stems are compared.
const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'by',
  'can',
  'do',
  'does',
  'each',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'its',
  'no',
  'not',
  'of',
  'on',
  'or',
  'out',
  'per',
  'so',
  'than',
  'that',
  'the',
  'then',
  'these',
  'this',
  'those',
  'to',
  'up',
  'what',
  'when',
  'with',
  'you',
  'your',
]);

const ID = 'content-redundancy';

// Suffixes the simple stemmer strips, in priority order, keeping a stem longer than MIN_STEM_LENGTH.
const STEM_SUFFIXES = ['ing', 'ed', 'es', 's'];

/** @typedef {{ pointer: string, id: string, message: string, severity: 'error' }} RedundancyFinding */

/** Reads the redundancy word lists from content-rules.json. */
export function loadRedundancyConfig(raw = JSON.parse(readFileSync(RULES_URL, 'utf8'))) {
  return raw.redundancy;
}

function lastSegmentEndsWith(key, suffixes) {
  const lower = key.toLowerCase();
  return suffixes.some((suffix) => lower.endsWith(suffix));
}

/**
 * True when the pointer sits under a skipped key path, such as "meta." for document title and
 * description strings that never render in the page. A prefix is a dotted key path.
 */
function underSkippedPrefix(pointer, prefixes = []) {
  return prefixes.some((prefix) => {
    const base = `/${prefix.replace(/\.+$/, '').split('.').join('/')}`;
    return pointer === base || pointer.startsWith(`${base}/`);
  });
}

/** A simple suffix stemmer: strips one of ing, ed, es or s, keeping a stem of three letters. */
function stem(word) {
  for (const suffix of STEM_SUFFIXES) {
    if (word.endsWith(suffix) && word.length > MIN_STEM_LENGTH + suffix.length) {
      return word.slice(0, -suffix.length);
    }
  }
  return word;
}

/** The content-word stems of a string, with stopwords and single letters dropped. */
export function contentStems(text) {
  const stems = new Set();
  for (const word of text.toLowerCase().match(/[a-z]+/g) ?? []) {
    if (word.length < MIN_WORD_LENGTH || STOPWORDS.has(word)) continue;
    stems.add(stem(word));
  }
  return stems;
}

function sharedStemCount(first, second) {
  let count = 0;
  for (const value of first) {
    if (second.has(value)) count += 1;
  }
  return count;
}

/** True when the string opens with one of the banned control-narrating phrases. */
export function opensWithBannedPhrase(text, openers) {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, ' ');
  return openers.some((opener) => {
    if (!normalized.startsWith(opener)) return false;
    const next = normalized[opener.length];
    return next === undefined || !/[a-z]/.test(next);
  });
}

function bannedOpenerFinding(pointer, text, config) {
  if (!opensWithBannedPhrase(text, config.bannedOpeners)) return [];
  return [
    {
      pointer,
      id: ID,
      severity: 'error',
      message: 'Opens by narrating a control the reader can see; show the state or the number.',
    },
  ];
}

function sharedWordFinding(pointer, text, labels, config) {
  const helpStems = contentStems(text);
  for (const [, labelText] of labels) {
    const shared = sharedStemCount(helpStems, contentStems(labelText));
    if (shared > config.maxSharedContentWords) {
      return [
        {
          pointer,
          id: ID,
          severity: 'error',
          message: `Repeats ${String(shared)} content words from its label "${labelText}"; keep at most ${String(config.maxSharedContentWords)}.`,
        },
      ];
    }
  }
  return [];
}

/** Every redundancy finding in a parsed locale document, by JSON pointer. */
export function* redundancyFindings(value, config, pointer = '') {
  if (value === null || typeof value !== 'object') return;
  const entries = Object.entries(value);
  const strings = entries.filter(([, child]) => typeof child === 'string');
  const labels = strings.filter(([key]) => lastSegmentEndsWith(key, config.labelSuffixes));
  for (const [key, text] of strings) {
    if (!lastSegmentEndsWith(key, config.helpSuffixes)) continue;
    const childPointer = `${pointer}/${key}`;
    if (underSkippedPrefix(childPointer, config.skipKeyPrefixes)) continue;
    yield* bannedOpenerFinding(childPointer, text, config);
    yield* sharedWordFinding(childPointer, text, labels, config);
  }
  for (const [key, child] of entries) {
    if (child !== null && typeof child === 'object') {
      yield* redundancyFindings(child, config, `${pointer}/${key}`);
    }
  }
}

/** Redundancy findings for one locale JSON document. */
export function lintRedundancy(text, config = loadRedundancyConfig()) {
  return [...redundancyFindings(JSON.parse(text), config)];
}
