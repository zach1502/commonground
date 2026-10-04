import { describe, expect, it } from 'vitest';

import { DRAFT_BLURB, isPlaceholder, loadShowcase, storedBlurb } from './showcase.js';

const SHOWCASE_COUNT = 5;

describe('showcase designs', () => {
  it('loads five designs with distinct titles, authors and lead ideas', () => {
    const showcase = loadShowcase();
    expect(showcase).toHaveLength(SHOWCASE_COUNT);
    expect(new Set(showcase.map(({ title }) => title)).size).toBe(SHOWCASE_COUNT);
    expect(new Set(showcase.map(({ author }) => author)).size).toBe(SHOWCASE_COUNT);
    expect(new Set(showcase.map(({ tags }) => tags[0])).size).toBe(SHOWCASE_COUNT);
  });

  it('keeps each blurb as the team placeholder until someone writes it', () => {
    for (const entry of loadShowcase()) {
      expect(isPlaceholder(entry.blurb), entry.file).toBe(true);
      expect(storedBlurb(entry.blurb)).toBe(DRAFT_BLURB);
    }
  });

  it('stores a written blurb unchanged', () => {
    const written = 'Text a team member wrote.';
    expect(isPlaceholder(written)).toBe(false);
    expect(storedBlurb(written)).toBe(written);
  });
});
