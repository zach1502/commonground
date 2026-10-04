import { readFileSync } from 'node:fs';

import { stringsIn } from './locale-strings.js';

/**
 * Terminology check for locale files. One term names each concept (CONTENT.md#terminology); the
 * rejected synonyms in content-rules.json termBans must not appear in a locale value. This runs
 * only through the preflight `content-terminology` rule, never through checkText, so `lint:content`
 * stays scoped to the shared prose rules.
 */

const RULES_URL = new URL('../preflight/content-rules.json', import.meta.url);

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Whole-word, case-insensitive matcher for each banned synonym. */
export function compileTermBans(terms) {
  return terms.map((term) => ({ term, re: new RegExp(`\\b${escapeRegExp(term)}\\b`, 'giu') }));
}

function defaultTerms() {
  return JSON.parse(readFileSync(RULES_URL, 'utf8')).termBans ?? [];
}

/**
 * Every rejected synonym in a locale document.
 * @returns {{ pointer: string, term: string, message: string, severity: 'error' }[]}
 */
export function lintTermBans(text, matchers = compileTermBans(defaultTerms())) {
  const findings = [];
  for (const [pointer, value] of stringsIn(JSON.parse(text))) {
    for (const { term, re } of matchers) {
      if (value.match(re) !== null) {
        findings.push({
          pointer,
          term,
          message: `Do not use "${term}" in UI text; use the chosen term for its concept.`,
          severity: 'error',
        });
      }
    }
  }
  return findings;
}
