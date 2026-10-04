import { describe, expect, it } from 'vitest';

import { messages } from './messages';

// CONTENT.md copy budgets: every word the reader sees on the surface, headings and links too.
const LANDING_WORDS = 30;
const EMPTY_STATE_WORDS = 20;
const DIALOG_WORDS = 40;

function wordCount(...texts: readonly string[]): number {
  return texts
    .join(' ')
    .split(/\s+/)
    .filter((word) => /\w/.test(word)).length;
}

describe('copy budgets', () => {
  it('keeps the landing page within 30 words', () => {
    const { landing, project } = messages;
    const line = [landing.line, project.deadline.open];
    expect(
      wordCount(
        landing.heading,
        ...line,
        landing.design,
        landing.vote,
        landing.stats,
        landing.statsDesigns.other,
      ),
    ).toBeLessThanOrEqual(LANDING_WORDS);
  });

  // The brief is staff text, like the generated summary, so only the app's own copy counts here.
  it('keeps the demo project page within the landing budget of 30 words', () => {
    const { project, landing } = messages;
    const buttons = [project.startDesign, project.gallery, project.vote, project.leaderboard];
    const facts = [project.area, landing.line, project.deadline.open, project.brief];
    expect(
      wordCount(landing.heading, ...facts, project.designCount.other, ...buttons),
    ).toBeLessThanOrEqual(LANDING_WORDS);
  });

  it('keeps the submit dialog within 40 words', () => {
    const { submit } = messages;
    expect(
      wordCount(submit.title, ...Object.values(submit.rules), submit.cancel, submit.action),
    ).toBeLessThanOrEqual(DIALOG_WORDS);
  });

  it.each([
    ['gallery', [messages.gallery.empty, messages.gallery.emptyAction]],
    ['projects', [messages.projects.empty]],
    ['leaderboard', [messages.leaderboard.empty, messages.leaderboard.emptyAction]],
    ['vote', [messages.vote.empty, messages.vote.seeLeaderboard]],
    ['staff', [messages.staff.empty]],
    ['insights reasons', [messages.insights.reasons.empty]],
    ['insights features', [messages.insights.features.empty]],
  ] as const)('keeps the %s empty state within 20 words', (_name, texts) => {
    expect(wordCount(...texts)).toBeLessThanOrEqual(EMPTY_STATE_WORDS);
  });
});
