import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  composeBlurb,
  composeTitle,
  generatedIntents,
  LEAD_TAGS,
  loadFragmentBank,
  seedPeople,
  type DesignFacts,
} from '@parkshape/db/seed';
import { checkText } from '@parkshape/textlint-rule-content/checker';

const FRAGMENTS = new URL('../../../packages/db/seed/fragments.json', import.meta.url);
const COMMENTS = new URL('../../../packages/db/seed/comments.json', import.meta.url);
const FACTS: DesignFacts = {
  lockedTrees: 12,
  newTrees: 8,
  plots: 24,
  costCad: 431_900,
  pathM: 212,
};
const VARIANTS = 6;

/** Every string value in a JSON document, keys left out. */
function strings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
  return [];
}

function problems(texts: readonly string[]) {
  return texts.flatMap((text) =>
    checkText(text, { scope: 'all' })
      .filter(({ severity }) => severity === 'error')
      .map(({ id }) => `${id}: ${text}`),
  );
}

describe('seed text passes the content rules', () => {
  const bank = loadFragmentBank();

  it('has no banned word, dash, emoji or curly quote in the fragment bank', () => {
    const fragments = strings(JSON.parse(readFileSync(FRAGMENTS, 'utf8'))).filter(
      (text) => !text.startsWith('Hand-written fragments.'),
    );
    expect(problems(fragments)).toEqual([]);
  });

  it('has no banned word, dash, emoji or curly quote in the seed element comments', () => {
    const file = JSON.parse(readFileSync(COMMENTS, 'utf8')) as { comments: { text: string }[] };
    const texts = file.comments.map(({ text }) => text).filter((text) => text !== '');
    expect(texts.length).toBeGreaterThan(0);
    expect(problems(texts)).toEqual([]);
  });

  it('passes for every title and blurb the seed can put together', () => {
    const titles = generatedIntents().map(({ lead, variant, intent }) =>
      composeTitle(bank, { lead, variant, pathStyle: intent.paths.style }),
    );
    const blurbs = LEAD_TAGS.flatMap((lead) =>
      Array.from({ length: VARIANTS }, (_, variant) =>
        composeBlurb(bank, { lead, variant, facts: FACTS }),
      ),
    );
    expect(problems([...titles, ...blurbs])).toEqual([]);
    expect(blurbs.every((blurb) => blurb.startsWith('I '))).toBe(true);
  });

  it('passes for every persona name', () => {
    const { residents, staff } = seedPeople();
    expect(problems([...residents, staff].map(({ displayName }) => displayName))).toEqual([]);
  });

  it('flags a banned word, so the check is live', () => {
    expect(problems(['A vibrant park'])).toHaveLength(1);
  });
});
