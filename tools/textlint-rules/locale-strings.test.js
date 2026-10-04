import { describe, expect, it } from 'vitest';

import {
  formatProblem,
  jsonFileArgs,
  lintJsonText,
  lintLocaleReadability,
  localeFilesIn,
  scopeForFile,
  stringsIn,
} from './locale-strings.js';

describe('stringsIn', () => {
  it('yields every string value with its JSON pointer', () => {
    const value = { home: { heading: 'Parks', count: 2, tags: ['a', null] }, root: 'r' };
    expect([...stringsIn(value)]).toEqual([
      ['/home/heading', 'Parks'],
      ['/home/tags/0', 'a'],
      ['/root', 'r'],
    ]);
    expect([...stringsIn('solo')]).toEqual([['/', 'solo']]);
  });
});

describe('scopeForFile', () => {
  it('uses locale rules only under apps/web/src/locales', () => {
    expect(scopeForFile('apps/web/src/locales/en.json')).toBe('locales');
    expect(scopeForFile('C:\\repo\\apps\\web\\src\\locales\\fr.json')).toBe('locales');
    expect(scopeForFile('packages/db/seed/parks.json')).toBe('all');
  });
});

describe('localeFilesIn', () => {
  it('keeps only the app locale files under the repo root', () => {
    const root = '/repo';
    const files = [
      '/repo/apps/web/src/locales/en.json',
      '/repo/tools/preflight/fixtures/rules/content-wordlist/fail/apps/web/src/locales/en.json',
      '/repo/package.json',
    ];
    expect(localeFilesIn(files, root)).toEqual(['/repo/apps/web/src/locales/en.json']);
  });

  it('accepts Windows separators', () => {
    const files = ['C:\\repo\\apps\\web\\src\\locales\\fr.json', 'C:\\repo\\x.json'];
    expect(localeFilesIn(files, 'C:\\repo')).toEqual([files[0]]);
  });
});

describe('lintJsonText', () => {
  it('reports problems per string and formats them on one line', () => {
    const problems = lintJsonText('{"cta": "Vote now!"}', 'apps/web/src/locales/en.json');
    expect(problems).toHaveLength(1);
    expect(formatProblem(problems[0])).toBe(
      'apps/web/src/locales/en.json /cta error UI strings do not use exclamation marks. (ui-exclamation)',
    );
  });

  it('honours an explicit scope', () => {
    expect(lintJsonText('{"cta": "Vote now!"}', 'seed.json')).toEqual([]);
    expect(lintJsonText('{"cta": "Vote now!"}', 'seed.json', 'locales')).toHaveLength(1);
  });
});

describe('jsonFileArgs', () => {
  it('keeps JSON paths and leaves Markdown to textlint', () => {
    const args = ['docs/DEMO.md', 'apps/web/src/locales/en.json', '--scope=all'];
    expect(jsonFileArgs(args)).toEqual(['apps/web/src/locales/en.json']);
  });
});

describe('lintLocaleReadability', () => {
  const hard =
    'Accessibility considerations necessitate comprehensive evaluation. Participation requires registration.';

  it('reports multi-sentence locale strings above grade 8 by pointer', () => {
    const text = JSON.stringify({ vote: { help: hard, label: 'Vote' } });
    const problems = lintLocaleReadability(text, 'apps/web/src/locales/en.json');
    expect(problems.map(({ pointer }) => pointer)).toEqual(['/vote/help']);
    expect(problems[0]?.finding.severity).toBe('error');
  });

  it('leaves seed JSON alone', () => {
    expect(lintLocaleReadability(JSON.stringify({ a: hard }), 'packages/db/seed/a.json')).toEqual(
      [],
    );
  });
});
