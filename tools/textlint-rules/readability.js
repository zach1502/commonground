import { readFileSync } from 'node:fs';

import { maskMarkdown } from './content-checker.js';

/**
 * Flesch-Kincaid grade level for UI strings and developer docs (CONTENT.md#who-we-write-for).
 * Grade = 0.39 x words per sentence + 11.8 x syllables per word - 15.59.
 * Syllables come from the vowel-group count with the corrections from Greg Fast's
 * Lingua::EN::Syllable, which is right for most English words and close for the rest.
 */

const RULES_URL = new URL('../preflight/content-rules.json', import.meta.url);
export const LOCALE_GRADE_LIMIT = 8;
export const DOC_GRADE_LIMIT = 10;
/** Doc paragraphs over the limit are errors; every doc paragraph passed when the check landed. */
export const DOC_SEVERITY = 'error';
// List items shorter than this are labels, not prose.
const MIN_LIST_ITEM_WORDS = 8;
const WORDS_PER_SENTENCE_WEIGHT = 0.39;
const SYLLABLES_PER_WORD_WEIGHT = 11.8;
const GRADE_OFFSET = 15.59;
const SHORT_WORD_LENGTH = 3;

// Vowel groups that are one syllable, though the count sees two.
const SUBTRACT_SYLLABLE = [
  /cia/,
  /tia/,
  /cius/,
  /cious/,
  /[^aeiou]giu/,
  /[aeiouy][^aeiouy]ion/,
  /iou/,
  /sia$/,
  /eous$/,
  /[oa]gue$/,
  /.[^aeiuoycgltdb]{2,}ed$/,
  /.ely$/,
  /^jua/,
  /uai/,
  /eau/,
  /[aeiouy](?:[bcfgklmnprsvwxyz]|ch|dg|g[hn]|lch|l[lv]|mm|nch|n[cgn]|r[bcnsv]|squ|s[chkls]|th)ed$/,
  /[aeiouy](?:[bdfklmnprstvy]|ch|g[hn]|lch|l[lv]|mm|nch|nn|r[nsv]|squ|s[cklst]|th)es$/,
];
// Vowel pairs and endings that are two syllables, though the count sees one.
const ADD_SYLLABLE = [
  /ia/,
  /riet/,
  /dien/,
  /iu/,
  /io/,
  /ii/,
  /[aeiou]{3}/,
  /^mc/,
  /ism$/,
  /([^aeiouy])\1l$/,
  /[^l]lien/,
  /^coa[dglx]./,
  /[^gq]ua[^auieo]/,
  /dnt$/,
  /uity$/,
  /ie(?:r|st)$/,
  /eat/,
  /ea$/,
];
const ABBREVIATIONS = /\b(?:e\.g|i\.e|etc|vs|approx|No)\./g;
const ABBREVIATION_MARK = '\u0000';
const SENTENCE_BREAK = /(?<=[.!?])["')\]]*\s+/u;
const WORD_CHAR = /[\p{L}\p{N}]/u;

/** Syllables in one word. Numbers, symbols and words of three letters or fewer count as 1. */
export function countSyllables(word) {
  const letters = word.toLowerCase().replace(/[^a-z]/g, '');
  if (letters.length <= SHORT_WORD_LENGTH) {
    return 1;
  }
  // A final e is silent (vote, shade) except in consonant + le (table, people).
  const stem = letters.replace(/(?<![^aeiouy]l)e$/, '');
  const groups = stem.split(/[^aeiouy]+/).filter((part) => part !== '').length;
  const subtract = SUBTRACT_SYLLABLE.filter((re) => re.test(stem)).length;
  const add = ADD_SYLLABLE.filter((re) => re.test(stem)).length;
  return Math.max(1, groups - subtract + add);
}

/** Sentences split after `.`, `?` or `!` and a space; decimals and e.g. stay whole. */
export function splitSentences(text) {
  const protectedText = text.replace(ABBREVIATIONS, (match) =>
    match.replaceAll('.', ABBREVIATION_MARK),
  );
  return protectedText
    .split(SENTENCE_BREAK)
    .map((sentence) => sentence.replaceAll(ABBREVIATION_MARK, '.').trim())
    .filter((sentence) => WORD_CHAR.test(sentence));
}

function wordsOf(text) {
  return text.split(/\s+/).filter((token) => WORD_CHAR.test(token));
}

/** Sentence, word and syllable counts; text with words is at least one sentence. */
export function textStats(text) {
  const words = wordsOf(text);
  const syllables = words.reduce((sum, word) => sum + countSyllables(word), 0);
  return {
    sentences: Math.max(1, splitSentences(text).length),
    words: words.length,
    syllables,
  };
}

/** Flesch-Kincaid grade from the counts. */
export function gradeLevel({ sentences, words, syllables }) {
  if (words === 0) {
    return 0;
  }
  return (
    WORDS_PER_SENTENCE_WEIGHT * (words / sentences) +
    SYLLABLES_PER_WORD_WEIGHT * (syllables / words) -
    GRADE_OFFSET
  );
}

function finding({ index, length, grade, limit, severity, subject }) {
  return {
    id: 'readability',
    index,
    length,
    grade,
    message: `${subject} reads at grade ${grade.toFixed(1)}; the limit is ${limit.toFixed(1)}. Use shorter sentences and shorter words.`,
    severity,
  };
}

let cachedVerbatim;

/** Legal text a licence makes us quote word for word: the `verbatim` list in content-rules.json. */
function verbatimQuotes() {
  cachedVerbatim ??= (JSON.parse(readFileSync(RULES_URL, 'utf8')).verbatim ?? []).map(
    ({ text }) => text,
  );
  return cachedVerbatim;
}

/**
 * The text with each listed quote taken out. The licence fixes those words, so the grade measures
 * only the words around them. A quote that differs by one word stays in and is graded.
 */
function withoutVerbatim(text) {
  return verbatimQuotes().reduce((rest, quote) => rest.replaceAll(quote, ' '), text);
}

/**
 * A multi-sentence locale string above grade 8 is an error. One-sentence strings are skipped,
 * and listed verbatim legal text is left out of the grade.
 */
export function localeReadabilityFindings(text, limit = LOCALE_GRADE_LIMIT) {
  const stats = textStats(withoutVerbatim(text));
  const grade = gradeLevel(stats);
  if (stats.sentences <= 1 || grade <= limit) {
    return [];
  }
  return [
    finding({ index: 0, length: text.length, grade, limit, severity: 'error', subject: 'String' }),
  ];
}

const INLINE_REPLACEMENTS = [
  [/<!--[\s\S]*?-->/g, ' '],
  [/!\[[^\]]*\]\([^)]*\)/g, ' '],
  [/\[([^\]]*)\]\([^)]*\)/g, '$1'],
  [/<https?:[^>\s]*>/g, 'link'],
  [/https?:\/\/\S+/g, 'link'],
  [/`[^`\n]*`/g, 'code'],
  // A reader says a path or file name as one name, so it counts as one short word.
  [/(?:[\w.-]+\/)+[\w-]+(?:\.\w+)?|\b[\w-]+\.(?:md|json|ts|tsx|js|css|sql|ya?ml|txt)\b/g, 'file'],
  [/<\/?[a-z][^>]*>/gi, ' '],
  [/[*_]{1,3}(?=\S)|(?<=\S)[*_]{1,3}/g, ''],
];

/** Markdown inline syntax reduced to the words a reader sees. Inline code and paths read as one word. */
function plainText(markdown) {
  return INLINE_REPLACEMENTS.reduce((text, [re, to]) => text.replace(re, to), markdown)
    .replace(/\s+/g, ' ')
    .trim();
}

const HEADING = /^ {0,3}#/;
const TABLE_ROW = /^\s*\|/;
const LIST_MARKER = /^\s*(?:[-*+]|\d+[.)])\s+/;
const QUOTE_MARKER = /^\s*>\s?/;

/** Blank-line separated blocks of the masked source, with the offset of each line. */
function blocksOf(source) {
  const blocks = [];
  let current = [];
  let offset = 0;
  for (const line of maskMarkdown(
    source.replace(/<!--[\s\S]*?-->/g, (c) => c.replace(/[^\n]/g, ' ')),
  ).split('\n')) {
    if (line.trim() === '') {
      current = [];
    } else {
      if (current.length === 0) {
        blocks.push(current);
      }
      current.push({ line, index: offset });
    }
    offset += line.length + 1;
  }
  return blocks;
}

/** Splits a list block into items; a line without a marker continues the item above it. */
function listItems(block) {
  const items = [];
  for (const entry of block) {
    if (LIST_MARKER.test(entry.line) || items.length === 0) {
      items.push([entry]);
    } else {
      items.at(-1).push(entry);
    }
  }
  return items;
}

function paragraphOf(lines, marker) {
  const text = plainText(lines.map(({ line }) => line.replace(marker, '')).join(' '));
  const last = lines.at(-1);
  return { index: lines[0].index, length: last.index + last.line.length - lines[0].index, text };
}

function blockParagraphs(block) {
  const [first] = block;
  if (HEADING.test(first.line) || TABLE_ROW.test(first.line)) {
    return [];
  }
  if (LIST_MARKER.test(first.line)) {
    return listItems(block)
      .map((item) => paragraphOf(item, LIST_MARKER))
      .filter(({ text }) => wordsOf(text).length >= MIN_LIST_ITEM_WORDS);
  }
  return [paragraphOf(block, QUOTE_MARKER)];
}

/**
 * The prose paragraphs of a Markdown document with their source offsets. Headings, tables,
 * code, HTML comments and list items under 8 words are skipped.
 */
export function markdownParagraphs(source) {
  return blocksOf(source)
    .flatMap(blockParagraphs)
    .filter(({ text }) => WORD_CHAR.test(text));
}

/** A finding for each paragraph above `limit`; listed verbatim legal text is not graded. */
export function paragraphReadabilityFindings(
  source,
  { limit = DOC_GRADE_LIMIT, severity = DOC_SEVERITY } = {},
) {
  return markdownParagraphs(source).flatMap(({ index, length, text }) => {
    const grade = gradeLevel(textStats(withoutVerbatim(text)));
    return grade > limit
      ? [finding({ index, length, grade, limit, severity, subject: 'Paragraph' })]
      : [];
  });
}

const ROOT_DOCS = new Set(['README.md', 'AGENTS.md', 'CONTENT.md', 'CONTRIBUTING.md', 'DESIGN.md']);

/** The developer docs the paragraph check covers: the root docs and docs/*.md. */
export function isDocFile(relativePath) {
  const file = relativePath.replaceAll('\\', '/');
  return ROOT_DOCS.has(file) || /^docs\/[^/]+\.md$/.test(file);
}
