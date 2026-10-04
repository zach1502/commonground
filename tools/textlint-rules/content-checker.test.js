import { describe, expect, it } from 'vitest';

import {
  checkMarkdownSource,
  checkText,
  compileContentRules,
  isTitleCase,
  maskMarkdown,
} from './content-checker.js';

const ids = (findings) => findings.map((finding) => finding.id);
const TITLE_CASE = { threshold: 0.6, minLetters: 4, minWords: 2 };

const SAMPLE_RULES = compileContentRules({
  banned: ['meadow', 'open space', 'off-leash', "it's shady"],
  reviewOnly: [{ word: 'bench', note: 'Check the context.' }],
  hedges: [],
  patterns: [],
});

describe('checkText word lists', () => {
  const sample = SAMPLE_RULES;

  it('reports banned words case-insensitively on word boundaries', () => {
    const findings = checkText(
      'A Meadow here. Meadows and meadowlarks pass.',
      { scope: 'all' },
      sample,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: 'banned-word',
      index: 2,
      length: 6,
      severity: 'error',
    });
  });

  it('matches multi-word, hyphenated, and apostrophe phrases', () => {
    const text = "An open space, an off-leash area, and it's shady.";
    expect(ids(checkText(text, { scope: 'all' }, sample))).toEqual([
      'banned-word',
      'banned-word',
      'banned-word',
    ]);
  });

  it('reports review words as warnings with their note', () => {
    const [finding] = checkText('Sit on the bench.', { scope: 'all' }, sample);
    expect(finding).toMatchObject({ id: 'review-word', severity: 'warning' });
    expect(finding?.message).toContain('Check the context.');
  });

  it('matches every entry of content-rules.json against itself', () => {
    const rules = compileContentRules();
    for (const { word } of rules.banned) {
      expect(ids(checkText(word, { scope: 'all' }))).toContain('banned-word');
    }
    for (const { word } of rules.reviewOnly) {
      expect(ids(checkText(word, { scope: 'all' }))).toEqual(['review-word']);
    }
  });
});

describe('checkText patterns', () => {
  it('flags punctuation and rhetorical patterns in every scope', () => {
    const text =
      'A \u2014 B \u2013 C \u201Cq\u201D \u{1F333}. Not just parks, but paths. Not only this but also that. ' +
      "It isn't hard, it's easy. Moreover, yes. We chose paths rather than.";
    expect(ids(checkText(text, { scope: 'all' }))).toEqual([
      'em-dash',
      'en-dash-as-dash',
      'curly-quotes',
      'curly-quotes',
      'emoji',
      'not-just-but',
      'not-only-but-also',
      'isnt-its',
      'sentence-initial-transition',
      'rather-than-ending',
    ]);
  });

  it('applies exclamation and hedge checks to locales only', () => {
    const text = 'This might work!';
    expect(checkText(text, { scope: 'all' })).toEqual([]);
    expect(checkText(text, { scope: 'markdown' })).toEqual([]);
    expect(ids(checkText(text, { scope: 'locales' }))).toEqual(['hedge', 'ui-exclamation']);
  });
});

describe('isTitleCase', () => {
  it('flags headings where most longer words are capitalized', () => {
    expect(isTitleCase('Install The Dependencies', TITLE_CASE)).toBe(true);
    expect(isTitleCase('Install the dependencies', TITLE_CASE)).toBe(false);
  });

  it('ignores short headings and code spans', () => {
    expect(isTitleCase('CommonGround', TITLE_CASE)).toBe(false);
    expect(isTitleCase('Run `Pnpm Lint` locally', TITLE_CASE)).toBe(false);
  });
});

describe('checkMarkdownSource', () => {
  it('reports bold-header bullets, rules, and title case headings', () => {
    const source = '# Install The Dependencies\n\n- **Label**: text\n* **Other**: text\n\n---\n';
    expect(ids(checkMarkdownSource(source))).toEqual([
      'title-case-heading',
      'bold-header-bullet',
      'bold-header-bullet',
      'horizontal-rule',
    ]);
  });

  it('reports a bullet on its own line, not the blank line above it', () => {
    const [finding] = checkMarkdownSource('Text\n\n- **Label**: text\n');
    expect(finding).toMatchObject({ id: 'bold-header-bullet', index: 6 });
  });

  it('skips front matter and fenced code', () => {
    const source = '---\ntitle: Front Matter Title\n---\n\n```md\n---\n# Fenced Title Case\n```\n';
    expect(checkMarkdownSource(source)).toEqual([]);
  });
});

describe('maskMarkdown', () => {
  it('keeps offsets while blanking fenced lines', () => {
    const source = 'a\n~~~\ncode\n~~~\nb';
    const masked = maskMarkdown(source);
    expect(masked).toHaveLength(source.length);
    expect(masked).toBe('a\n   \n    \n   \nb');
  });
});
