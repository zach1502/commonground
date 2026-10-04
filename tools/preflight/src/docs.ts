import { writeFileSync } from 'node:fs';
import path from 'node:path';

import { format, resolveConfig } from 'prettier';

import { markerProblemsFor, type MarkerProblem } from './doc-markers.js';
import { fileExists, readJson, readText } from './files.js';
import type { PreflightRule } from './types.js';

export const DOC_SECTIONS: Readonly<Record<string, string>> = {
  agents: 'AGENTS.md',
  design: 'DESIGN.md',
  content: 'CONTENT.md',
};
export const DOC_FILES = ['AGENTS.md', 'DESIGN.md', 'CONTENT.md'];
export const CONTENT_RULES_FILE = 'tools/preflight/content-rules.json';
// The body may not hold another begin marker, so a lost end marker cannot swallow prose.
const MARKER_BLOCK =
  /(<!-- preflight:begin section=([\w-]+) -->)(?:(?!preflight:begin)[\s\S])*?(<!-- preflight:end -->)/g;

interface ContentRulesJson {
  readonly banned?: readonly string[];
  readonly reviewOnly?: readonly { word: string; note: string }[];
  readonly hedges?: readonly string[];
  readonly patterns?: readonly { id: string; message: string; scope: string }[];
}

// Paths, file names and literal markers render as code so Markdown leaves them alone.
const LITERAL_TOKEN =
  /(?:[\w.<>*@-]*\/[\w.<>*@/-]*[\w>*]|\.env\.example|\[no-test\]|TODO\(#\d+\)|var\(\)|--docs)/g;

function cell(text: string): string {
  return text.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

/** Wraps literal tokens outside existing code spans in backticks. */
export function codeLiterals(text: string): string {
  return text
    .split(/(`[^`]*`)/)
    .map((part) =>
      part.startsWith('`') ? part : part.replace(LITERAL_TOKEN, (token) => `\`${token}\``),
    )
    .join('');
}

function code(text: string): string {
  return `\`${cell(text)}\``;
}

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const lines = [header, header.map(() => '---'), ...rows].map((row) => `| ${row.join(' | ')} |`);
  return lines.join('\n');
}

/** The rule table for one doc: rules whose doc anchor points into that file. */
export function ruleTable(rules: readonly PreflightRule[], docFile: string): string {
  const rows = rules
    .filter((rule) => rule.doc.split('#')[0] === docFile)
    .map((rule) => [
      code(rule.id),
      cell(codeLiterals(rule.summary)),
      rule.tier,
      cell(codeLiterals(rule.fixHint)),
    ]);
  if (rows.length === 0) {
    return 'No preflight rule points at this file yet.';
  }
  return table(['Rule', 'Checks', 'Tier', 'Fix'], rows);
}

/** The word list tables, rendered from content-rules.json. */
export function wordlistTables(rules: ContentRulesJson): string {
  return [
    '### Banned words',
    'Each word or phrase is an error in docs, UI strings, seed text and commit messages.',
    table(
      ['Word'],
      (rules.banned ?? []).map((word) => [code(word)]),
    ),
    '### Review words',
    'Each word is a warning. Read the sentence and rewrite it when the note applies. Notes and messages are quoted from the rules file.',
    table(
      ['Word', 'Note'],
      (rules.reviewOnly ?? []).map(({ word, note }) => [code(word), code(note)]),
    ),
    '### Hedges',
    'Each hedge is a warning in UI strings.',
    table(
      ['Hedge'],
      (rules.hedges ?? []).map((hedge) => [code(hedge)]),
    ),
    '### Patterns',
    'Each pattern is an error in the scope it names.',
    table(
      ['Pattern', 'Scope', 'Message'],
      (rules.patterns ?? []).map(({ id, scope, message }) => [code(id), scope, code(message)]),
    ),
  ].join('\n\n');
}

async function sectionBodies(
  rootDir: string,
  rules: readonly PreflightRule[],
): Promise<Map<string, string>> {
  const config = (await resolveConfig(path.join(rootDir, 'AGENTS.md'))) ?? {};
  const pretty = (markdown: string): Promise<string> =>
    format(markdown, { ...config, parser: 'markdown' });
  const bodies = new Map<string, string>();
  for (const [section, docFile] of Object.entries(DOC_SECTIONS)) {
    bodies.set(section, await pretty(ruleTable(rules, docFile)));
  }
  const contentRules = readJson(rootDir, CONTENT_RULES_FILE) as ContentRulesJson | undefined;
  if (contentRules !== undefined) {
    bodies.set('wordlist', await pretty(wordlistTables(contentRules)));
  }
  return bodies;
}

/** Replaces only the text between each begin and end marker; the rest stays byte-identical. */
export function replaceMarkerBlocks(source: string, bodies: ReadonlyMap<string, string>): string {
  return source.replace(MARKER_BLOCK, (whole, begin: string, section: string, end: string) => {
    const body = bodies.get(section);
    return body === undefined ? whole : `${begin}\n\n${body.trim()}\n\n${end}`;
  });
}

/** Missing section blocks and unpaired markers in one doc. */
export function markerProblems(file: string, source: string): MarkerProblem[] {
  return markerProblemsFor(file, source, DOC_SECTIONS);
}

export interface RenderedDoc {
  readonly file: string;
  readonly current: string;
  readonly rendered: string;
  readonly problems: readonly MarkerProblem[];
}

/** Renders every doc's marker blocks in memory. */
export async function renderDocs(
  rootDir: string,
  rules: readonly PreflightRule[],
): Promise<RenderedDoc[]> {
  const bodies = await sectionBodies(rootDir, rules);
  return DOC_FILES.filter((file) => fileExists(rootDir, file)).map((file) => {
    const current = readText(rootDir, file);
    return {
      file,
      current,
      rendered: replaceMarkerBlocks(current, bodies),
      problems: markerProblems(file, current),
    };
  });
}

/** Writes rendered docs to disk and returns the files that changed. */
export async function writeDocs(
  rootDir: string,
  rules: readonly PreflightRule[],
): Promise<string[]> {
  const docs = await renderDocs(rootDir, rules);
  const changed = docs.filter(({ current, rendered }) => current !== rendered);
  for (const doc of changed) {
    writeFileSync(path.join(rootDir, doc.file), doc.rendered);
  }
  return changed.map(({ file }) => file);
}
