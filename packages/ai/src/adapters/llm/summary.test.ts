import { describe, expect, it } from 'vitest';

import { ok } from '@parkshape/core';

import {
  COMMENTED_SUMMARY_INPUT,
  SUMMARY_INPUT,
} from '../../ports/__contracts__/summary-fixtures.js';
import { summaryProviderContract } from '../../ports/__contracts__/summary-provider.contract.js';
import { FakeLlmClient } from '../fake/fake-llm-client.js';
import { MemoryLogger } from '../memory/memory-logger.js';
import { RuleBasedSummaryProvider } from '../rule-based/summary.js';

import { LlmSummaryProvider } from './summary.js';

const THINKING_ROOM_TOKENS = 4096;

const GOOD_ANSWER = {
  themes: [{ label: 'Shade and trees', designCount: 3, exampleDesignId: 'design-a' }],
  tradeoffs: [{ a: 'More trees', b: 'More play', leanA: 6, chose: 9 }],
};

function providerWith(answer: unknown, logger = new MemoryLogger()) {
  const client = new FakeLlmClient({ 'park-summary': answer });
  const provider = new LlmSummaryProvider({
    client,
    fallback: new RuleBasedSummaryProvider(),
    logger,
  });
  return { client, provider, logger };
}

summaryProviderContract('LlmSummaryProvider', () => providerWith(GOOD_ANSWER).provider);
summaryProviderContract(
  'LlmSummaryProvider falling back',
  () => providerWith({ themes: 'nope' }).provider,
);

describe('LlmSummaryProvider', () => {
  it('returns the model answer when it validates and fits the designs, naming the model', async () => {
    const { provider } = providerWith(GOOD_ANSWER);
    expect(await provider.summarize(SUMMARY_INPUT)).toEqual({
      source: 'model',
      model: 'fake-model',
      value: GOOD_ANSWER,
    });
  });

  it('builds the prompt from counts and categories, never raw design JSON', async () => {
    const { client, provider } = providerWith(GOOD_ANSWER);
    await provider.summarize(SUMMARY_INPUT);
    const user = client.requests[0]?.user ?? '';
    expect(user).toContain('7 live designs, 41 votes from 12 voters');
    expect(user).toContain('1. design-a, score 0.80: tree 9, seating 3, path 2, water 1');
    expect(user).toContain('trees 14, play 9, dog-area 4, too-paved 2');
    expect(user).not.toMatch(/[{}]/);
    expect(client.requests[0]?.schema.name).toBe('park-summary');
    // Gemini 3 counts thinking inside max_tokens, and 800 left some answers empty.
    expect(client.requests[0]?.maxTokens).toBeGreaterThanOrEqual(THINKING_ROOM_TOKENS);
  });

  it('gives the model the element comment counts, or none yet with no comments', async () => {
    const { client, provider } = providerWith(GOOD_ANSWER);
    await provider.summarize(COMMENTED_SUMMARY_INPUT);
    await provider.summarize(SUMMARY_INPUT);
    expect(client.requests[0]?.user).toContain(
      'Comments residents left on elements: 6, most on Bench 3, Gravel path 2',
    );
    expect(client.requests[1]?.user).toContain('Comments residents left on elements: none yet');
  });

  it('falls back and logs when the answer fails the schema', async () => {
    const { provider, logger } = providerWith({ themes: 'nope' });
    const fallback = await new RuleBasedSummaryProvider().summarize(SUMMARY_INPUT);
    expect(await provider.summarize(SUMMARY_INPUT)).toEqual(fallback);
    expect(logger.warnings[0]).toMatch(/^AI summary fell back to rule-based: schema/);
  });

  it('falls back when the answer names a design that is not in the top list', async () => {
    const answer = { ...GOOD_ANSWER, themes: [{ ...GOOD_ANSWER.themes[0], exampleDesignId: 'x' }] };
    const { provider, logger } = providerWith(answer);
    const fallback = await new RuleBasedSummaryProvider().summarize(SUMMARY_INPUT);
    expect(await provider.summarize(SUMMARY_INPUT)).toEqual(fallback);
    expect(logger.warnings[0]).toMatch(/inconsistent/);
  });

  it('falls back when the client fails, and says the rules wrote it', async () => {
    const logger = new MemoryLogger();
    const provider = new LlmSummaryProvider({
      client: new FakeLlmClient({}),
      fallback: new RuleBasedSummaryProvider(),
      logger,
    });
    expect((await provider.summarize(SUMMARY_INPUT)).source).toBe('rule-based');
    expect(logger.warnings).toEqual(['AI summary fell back to rule-based: no-answer']);
  });
});

describe('LlmSummaryProvider with a model chain', () => {
  it('names the model that answered, not the one the client tries first', async () => {
    const provider = new LlmSummaryProvider({
      client: {
        model: 'gemini-3.5-flash-lite',
        complete: () => Promise.resolve(ok({ model: 'gemini-3.1-flash-lite', value: GOOD_ANSWER })),
      },
      fallback: new RuleBasedSummaryProvider(),
      logger: new MemoryLogger(),
    });
    expect(await provider.summarize(SUMMARY_INPUT)).toMatchObject({
      source: 'model',
      model: 'gemini-3.1-flash-lite',
    });
  });
});
