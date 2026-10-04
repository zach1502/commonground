import { describe, expect, it } from 'vitest';

import { err, FakeClock, ok, type Result } from '@parkshape/core';

import { PROBE_REQUEST, llmClientContract } from '../../ports/__contracts__/llm-client.contract.js';
import type { Completion, LlmClient, LlmError } from '../../ports/llm-client.js';
import { MemoryLogger } from '../memory/memory-logger.js';

import {
  DEFAULT_COOLDOWN_MS,
  MAX_COOLDOWN_MS,
  ModelChainClient,
  type ChainLinks,
} from './model-chain-client.js';

const START = new Date('2026-10-03T12:00:00Z');
const RATE_LIMITED: LlmError = { kind: 'http', status: 429, message: 'quota' };

/** An inner client that gives one canned result per call and counts its calls. */
class ScriptedClient implements LlmClient {
  calls = 0;
  readonly model: string;
  readonly #results: Result<Completion, LlmError>[];

  constructor(model: string, results: readonly Result<Completion, LlmError>[]) {
    this.model = model;
    this.#results = [...results];
  }

  complete(): Promise<Result<Completion, LlmError>> {
    this.calls += 1;
    const next = this.#results.shift() ?? ok({ model: this.model, value: { answer: 'ok' } });
    return Promise.resolve(next);
  }
}

function setUp(firstResults: readonly Result<Completion, LlmError>[] = []) {
  const first = new ScriptedClient('first-model', firstResults);
  const second = new ScriptedClient('second-model', []);
  const clock = new FakeClock(START);
  const logger = new MemoryLogger();
  const links: ChainLinks = [first, second];
  const chain = new ModelChainClient({ clients: links, clock, logger });
  return { first, second, clock, logger, chain };
}

llmClientContract('ModelChainClient', () => setUp([err(RATE_LIMITED)]).chain);

describe('ModelChainClient', () => {
  it('names the first model as the one it calls first', () => {
    expect(setUp().chain.model).toBe('first-model');
  });

  it('asks the next model after a 429 and names it on the answer', async () => {
    const { chain, second, logger } = setUp([err(RATE_LIMITED)]);
    expect(await chain.complete(PROBE_REQUEST)).toEqual({
      ok: true,
      value: { model: 'second-model', value: { answer: 'ok' } },
    });
    expect(second.calls).toBe(1);
    expect(logger.warnings).toEqual(['AI model first-model answered 429; skipping it for 60 s.']);
  });

  it.each<LlmError>([
    { kind: 'http', status: 400, message: 'INVALID_ARGUMENT' },
    { kind: 'http', status: 503, message: 'busy' },
    { kind: 'network', message: 'timeout' },
    { kind: 'bad-envelope', message: 'nope' },
    { kind: 'bad-json', message: 'nope' },
  ])('returns $kind $status at once and leaves the next model alone', async (error) => {
    const { chain, second, logger } = setUp([err(error)]);
    expect(await chain.complete(PROBE_REQUEST)).toEqual({ ok: false, error });
    expect(second.calls).toBe(0);
    expect(logger.warnings).toEqual([]);
  });
});

describe('ModelChainClient cooldown', () => {
  it('skips a model in cooldown without calling it', async () => {
    const { chain, first, second, clock, logger } = setUp([err(RATE_LIMITED)]);
    await chain.complete(PROBE_REQUEST);
    clock.advance(DEFAULT_COOLDOWN_MS - 18_000);
    const result = await chain.complete(PROBE_REQUEST);
    expect(result.ok ? result.value.model : '').toBe('second-model');
    expect(first.calls).toBe(1);
    expect(second.calls).toBe(2);
    expect(logger.warnings[1]).toBe('AI model first-model skipped; rate limited for 18 s more.');
  });

  it('tries the model again once the default 60 s cooldown ends on the clock', async () => {
    const { chain, first, clock } = setUp([err(RATE_LIMITED)]);
    await chain.complete(PROBE_REQUEST);
    clock.advance(DEFAULT_COOLDOWN_MS - 1);
    await chain.complete(PROBE_REQUEST);
    expect(first.calls).toBe(1);
    clock.advance(1);
    const result = await chain.complete(PROBE_REQUEST);
    expect(result.ok ? result.value.model : '').toBe('first-model');
    expect(first.calls).toBe(2);
  });

  it('waits as long as the server asked when the 429 says', async () => {
    const { chain, first, clock, logger } = setUp([err({ ...RATE_LIMITED, retryAfterMs: 31_000 })]);
    await chain.complete(PROBE_REQUEST);
    expect(logger.warnings).toEqual(['AI model first-model answered 429; skipping it for 31 s.']);
    clock.advance(30_999);
    await chain.complete(PROBE_REQUEST);
    expect(first.calls).toBe(1);
    clock.advance(1);
    await chain.complete(PROBE_REQUEST);
    expect(first.calls).toBe(2);
  });

  it('caps a long wait, such as a daily limit, at 15 minutes', async () => {
    const day = 24 * 60 * 60 * 1000;
    const { chain, first, clock, logger } = setUp([err({ ...RATE_LIMITED, retryAfterMs: day })]);
    await chain.complete(PROBE_REQUEST);
    expect(logger.warnings).toEqual(['AI model first-model answered 429; skipping it for 900 s.']);
    clock.advance(MAX_COOLDOWN_MS);
    await chain.complete(PROBE_REQUEST);
    expect(first.calls).toBe(2);
  });
});

describe('ModelChainClient when every model is rate limited', () => {
  function bothLimited() {
    const first = new ScriptedClient('first-model', [err(RATE_LIMITED)]);
    const second = new ScriptedClient('second-model', [err(RATE_LIMITED)]);
    const clock = new FakeClock(START);
    const logger = new MemoryLogger();
    const chain = new ModelChainClient({ clients: [first, second], clock, logger });
    return { first, second, chain, logger };
  }

  it('returns the last 429, so the caller falls back to the rules', async () => {
    const { chain, logger } = bothLimited();
    expect(await chain.complete(PROBE_REQUEST)).toEqual({ ok: false, error: RATE_LIMITED });
    expect(logger.warnings).toHaveLength(2);
  });

  it('calls no model while both are cooling down', async () => {
    const { chain, first, second } = bothLimited();
    await chain.complete(PROBE_REQUEST);
    expect(await chain.complete(PROBE_REQUEST)).toEqual({
      ok: false,
      error: { kind: 'cooling-down', models: ['first-model', 'second-model'] },
    });
    expect(first.calls + second.calls).toBe(2);
  });
});
