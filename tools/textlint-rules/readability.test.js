import { describe, expect, it } from 'vitest';

import {
  countSyllables,
  gradeLevel,
  isDocFile,
  localeReadabilityFindings,
  markdownParagraphs,
  paragraphReadabilityFindings,
  splitSentences,
  textStats,
} from './readability.js';

describe('countSyllables', () => {
  const known = {
    park: 1,
    tree: 1,
    the: 1,
    vote: 1,
    shade: 1,
    trees: 1,
    voted: 2,
    design: 2,
    table: 2,
    planner: 2,
    garden: 2,
    budget: 2,
    people: 2,
    simple: 2,
    canopy: 3,
    area: 3,
    idea: 3,
    resident: 3,
    residents: 3,
    created: 3,
    accessible: 4,
    elevation: 4,
    community: 4,
    neighbourhood: 3,
    readability: 5,
    responsibility: 6,
  };
  for (const [word, syllables] of Object.entries(known)) {
    it(`counts ${String(syllables)} in "${word}"`, () => {
      expect(countSyllables(word)).toBe(syllables);
    });
  }

  it('counts a number or a lone letter as one syllable', () => {
    expect(countSyllables('250')).toBe(1);
    expect(countSyllables('m')).toBe(1);
  });
});

describe('splitSentences', () => {
  it('splits on full stops, question marks and exclamation marks', () => {
    expect(splitSentences('Path is 7% grade. Is it steep? Yes!')).toEqual([
      'Path is 7% grade.',
      'Is it steep?',
      'Yes!',
    ]);
  });

  it('keeps decimals and common abbreviations inside one sentence', () => {
    expect(splitSentences('Raise it 0.5 m, e.g. near the garden. Then vote.')).toHaveLength(2);
  });

  it('counts text with no end mark as one sentence', () => {
    expect(splitSentences('Submit design')).toEqual(['Submit design']);
  });
});

describe('gradeLevel', () => {
  it('applies 0.39 x words per sentence + 11.8 x syllables per word - 15.59', () => {
    // 2 sentences, 10 words, 14 syllables: 0.39 x 5 + 11.8 x 1.4 - 15.59 = 2.88.
    expect(gradeLevel({ sentences: 2, words: 10, syllables: 14 })).toBeCloseTo(2.88, 2);
  });

  it('measures text through its word, sentence and syllable counts', () => {
    expect(textStats('The park has trees. You can vote.')).toEqual({
      sentences: 2,
      words: 7,
      syllables: 7,
    });
  });
});

describe('localeReadabilityFindings', () => {
  it('skips one-sentence strings however long the words are', () => {
    expect(localeReadabilityFindings('Accessibility responsibilities documentation.')).toEqual([]);
  });

  it('reports multi-sentence strings above grade 8', () => {
    const [finding] = localeReadabilityFindings(
      'Accessibility considerations necessitate comprehensive evaluation. Participation requires registration.',
    );
    expect(finding).toMatchObject({ id: 'readability', severity: 'error' });
    expect(finding?.message).toMatch(/grade \d+\.\d; the limit is 8\.0/);
  });

  it('passes plain multi-sentence strings', () => {
    expect(
      localeReadabilityFindings('Path is 7% grade. Paths you can walk are 5% or less.'),
    ).toEqual([]);
  });
});

describe('markdownParagraphs', () => {
  it('skips headings, tables, code, comments and short list items', () => {
    const source = [
      '# Title here',
      '',
      '| a | b |',
      '| - | - |',
      '',
      '```sh',
      'pnpm install and a long line of code words',
      '```',
      '',
      '<!-- preflight:begin section=x -->',
      '',
      '- Short item.',
      '- This list item has eight words in it now.',
      '',
      'A plain paragraph with `code` and a [link](https://example.com).',
    ].join('\n');
    expect(markdownParagraphs(source).map(({ text }) => text)).toEqual([
      'This list item has eight words in it now.',
      'A plain paragraph with code and a link.',
    ]);
  });

  it('reads file paths and file names as one short word', () => {
    const [paragraph] = markdownParagraphs(
      'See docs/TRACEABILITY.md and [README.md](../README.md).',
    );
    expect(paragraph?.text).toBe('See file and file.');
  });

  it('keeps the offset of each paragraph in the source', () => {
    const source = 'Intro.\n\nSecond paragraph here.';
    const [, second] = markdownParagraphs(source);
    expect(source.slice(second?.index)).toBe('Second paragraph here.');
  });
});

describe('paragraphReadabilityFindings', () => {
  const hard =
    'Comprehensive accessibility considerations necessitate organizational responsibility. Documentation communicates institutional expectations.';

  it('reports paragraphs above the limit with the given severity', () => {
    const findings = paragraphReadabilityFindings(`Plain words here.\n\n${hard}\n`, {
      limit: 10,
      severity: 'warning',
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ id: 'readability', severity: 'warning', index: 19 });
  });
});

describe('isDocFile', () => {
  it('matches the root docs and docs/*.md only', () => {
    expect(['README.md', 'AGENTS.md', 'docs/WHY.md', 'CONTENT.md'].every(isDocFile)).toBe(true);
    expect(['packages/ui/README.md', 'docs/sub/a.md', 'e2e/README.md'].some(isDocFile)).toBe(false);
  });
});
