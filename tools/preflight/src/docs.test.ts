import { describe, expect, it } from 'vitest';

import {
  codeLiterals,
  markerProblems,
  renderDocs,
  replaceMarkerBlocks,
  ruleTable,
  wordlistTables,
} from './docs.js';
import { registry } from './registry.js';
import { fixtureDir, REPO_ROOT } from './testing/fixture-context.js';

const SOURCE = [
  'Intro stays.',
  '<!-- preflight:begin section=agents -->',
  '',
  'old text',
  '<!-- preflight:end -->',
  'Outro stays.',
  '',
].join('\n');

describe('docs', () => {
  it('replaces only the text between the markers', () => {
    const out = replaceMarkerBlocks(SOURCE, new Map([['agents', 'new table\n']]));
    expect(out).toBe(SOURCE.replace('\nold text\n', '\nnew table\n\n'));
    expect(replaceMarkerBlocks(SOURCE, new Map())).toBe(SOURCE);
  });
});

describe('docs markers', () => {
  it('keeps prose after a begin marker that has no end marker', () => {
    const source = [
      '<!-- preflight:begin section=agents -->',
      'Prose that must stay.',
      '<!-- preflight:begin section=design -->',
      'old',
      '<!-- preflight:end -->',
      '',
    ].join('\n');
    const out = replaceMarkerBlocks(
      source,
      new Map([
        ['agents', 'A'],
        ['design', 'D'],
      ]),
    );
    expect(out).toContain('Prose that must stay.');
    expect(out).toContain('section=design -->\n\nD\n\n<!-- preflight:end -->');
  });

  it('reports a missing section block and markers that do not pair up', () => {
    expect(markerProblems('AGENTS.md', 'No markers here.\n')).toEqual([
      { message: 'no generated block for section agents' },
    ]);
    expect(markerProblems('AGENTS.md', SOURCE)).toEqual([]);
    const unpaired = [
      '<!-- preflight:end -->',
      '<!-- preflight:begin section=agents -->',
      '<!-- preflight:begin section=agents -->',
      '<!-- preflight:end -->',
      '<!-- preflight:begin section=wordlist -->',
    ].join('\n');
    expect(markerProblems('AGENTS.md', unpaired)).toEqual([
      { line: 1, message: 'end marker has no begin marker' },
      { line: 2, message: 'begin marker for section agents has no end marker' },
      { line: 5, message: 'begin marker for section wordlist has no end marker' },
    ]);
  });
});

describe('docs rendering', () => {
  it('renders rules whose doc anchor points at the file', () => {
    const table = ruleTable(registry, 'DESIGN.md');
    expect(table).toContain('`design-tokens`');
    expect(table).not.toContain('`adapter-boundary`');
    expect(ruleTable(registry, 'NONE.md')).toBe('No preflight rule points at this file yet.');
  });

  it('wraps paths and literal markers in code spans', () => {
    expect(codeLiterals('Move it into packages/<pkg>/src/adapters now.')).toBe(
      'Move it into `packages/<pkg>/src/adapters` now.',
    );
    expect(codeLiterals('Keep `a/b` as is.')).toBe('Keep `a/b` as is.');
  });

  it('renders the word list tables', () => {
    const out = wordlistTables({
      banned: ['wordy'],
      reviewOnly: [{ word: 'key', note: 'n' }],
      hedges: ['may'],
      patterns: [{ id: 'em-dash', scope: 'all', message: 'm | x' }],
    });
    expect(out).toContain('| `wordy` |');
    expect(out).toContain('| `em-dash` | all | `m \\| x` |');
    expect(wordlistTables({})).toContain('### Patterns');
  });

  it('keeps the repo docs in sync with the registry', async () => {
    const docs = await renderDocs(REPO_ROOT, registry);
    expect(docs.map(({ file }) => file)).toEqual(['AGENTS.md', 'DESIGN.md', 'CONTENT.md']);
    expect(
      docs.filter(({ current, rendered }) => current !== rendered).map(({ file }) => file),
    ).toEqual([]);
    expect(docs.flatMap(({ problems }) => problems)).toEqual([]);
  });

  it('skips docs that do not exist', async () => {
    expect(await renderDocs(fixtureDir('docs-in-sync', 'fail'), [])).toHaveLength(1);
  });
});
