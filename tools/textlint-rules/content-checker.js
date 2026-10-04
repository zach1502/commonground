import { readFileSync } from 'node:fs';

/**
 * Prose checks shared by the textlint rule, the locale linter, and commitlint.
 * Every word list and pattern comes from tools/preflight/content-rules.json.
 */

const RULES_URL = new URL('../preflight/content-rules.json', import.meta.url);
const FENCE = /^ {0,3}(`{3,}|~{3,})/;
const FRONT_MATTER_DELIMITER = '---';

/** @typedef {'markdown' | 'locales' | 'all'} Scope */
/** @typedef {{ id: string, index: number, length: number, message: string, severity: 'error' | 'warning' }} Finding */

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function wordMatcher(word) {
  return new RegExp(`\\b${escapeRegExp(word)}\\b`, 'giu');
}

/** Reads content-rules.json and builds the regular expressions once. */
export function compileContentRules(raw = JSON.parse(readFileSync(RULES_URL, 'utf8'))) {
  return {
    banned: raw.banned.map((word) => ({ word, re: wordMatcher(word) })),
    reviewOnly: raw.reviewOnly.map((entry) => ({ ...entry, re: wordMatcher(entry.word) })),
    hedges: raw.hedges.map((word) => ({ word, re: wordMatcher(word) })),
    patterns: raw.patterns.map((pattern) => ({
      ...pattern,
      re: new RegExp(pattern.regex, pattern.flags),
    })),
  };
}

let cachedRules;

function defaultRules() {
  cachedRules ??= compileContentRules();
  return cachedRules;
}

function collect(text, re, makeFinding) {
  return [...text.matchAll(re)].map((match) => makeFinding(match));
}

function wordFindings(text, entries, { id, severity, describe }) {
  return entries.flatMap((entry) =>
    collect(text, entry.re, (match) => ({
      id,
      index: match.index,
      length: match[0].length,
      message: describe(entry, match[0]),
      severity,
    })),
  );
}

function patternFindings(text, patterns) {
  return patterns.flatMap((pattern) =>
    collect(text, pattern.re, (match) => ({ match, pattern }))
      .filter(({ match }) => passesExtraTest(pattern, match))
      .map(({ match }) => ({
        id: pattern.id,
        index: match.index,
        length: match[0].length,
        message: pattern.message,
        severity: 'error',
      })),
  );
}

/** True when more than `threshold` of the longer words in a heading start with a capital. */
export function isTitleCase(heading, { threshold, minLetters, minWords }) {
  const words = heading
    .replace(/`[^`]*`/g, ' ')
    .split(/\s+/)
    .map((word) => word.replace(/[^\p{L}]/gu, ''))
    .filter((word) => word.length >= minLetters);
  if (words.length < minWords) {
    return false;
  }
  const capitalized = words.filter((word) => /^\p{Lu}/u.test(word)).length;
  return capitalized / words.length > threshold;
}

function passesExtraTest(pattern, match) {
  if (pattern.test === 'titleCase') {
    return isTitleCase(match[1] ?? '', pattern);
  }
  return true;
}

function sortByIndex(findings) {
  return findings.sort((left, right) => left.index - right.index);
}

/**
 * Checks plain prose. `markdown` applies the shared patterns (markdown-only patterns
 * run on the raw source instead); `locales` adds UI-only patterns and hedge warnings.
 * @param {string} text
 * @param {{ scope: Scope }} options
 * @returns {Finding[]}
 */
export function checkText(text, { scope }, rules = defaultRules()) {
  const patterns = rules.patterns.filter(
    (pattern) => pattern.scope === 'all' || (pattern.scope === scope && scope !== 'markdown'),
  );
  return sortByIndex([
    ...wordFindings(text, rules.banned, {
      id: 'banned-word',
      severity: 'error',
      describe: (entry) => `Avoid "${entry.word}"; say what you mean in plain words.`,
    }),
    ...wordFindings(text, rules.reviewOnly, {
      id: 'review-word',
      severity: 'warning',
      describe: (entry) => `Review "${entry.word}": ${entry.note}`,
    }),
    ...(scope === 'locales'
      ? wordFindings(text, rules.hedges, {
          id: 'hedge',
          severity: 'warning',
          describe: (entry) => `Hedge "${entry.word}" in UI text; state it plainly.`,
        })
      : []),
    ...patternFindings(text, patterns),
  ]);
}

/** Blanks front matter and fenced code so line patterns only see prose. Keeps offsets. */
export function maskMarkdown(source) {
  const lines = source.split('\n');
  let inFence = false;
  let inFrontMatter = lines[0] === FRONT_MATTER_DELIMITER;
  return lines
    .map((line, index) => {
      if (inFrontMatter) {
        inFrontMatter = index === 0 || line !== FRONT_MATTER_DELIMITER;
        return ' '.repeat(line.length);
      }
      const isFence = FENCE.test(line);
      const masked = inFence || isFence;
      inFence = isFence ? !inFence : inFence;
      return masked ? ' '.repeat(line.length) : line;
    })
    .join('\n');
}

/** Runs the markdown-only line patterns (bullets, rules, headings) on raw source. */
export function checkMarkdownSource(source, rules = defaultRules()) {
  const patterns = rules.patterns.filter((pattern) => pattern.scope === 'markdown');
  return sortByIndex(patternFindings(maskMarkdown(source), patterns));
}
