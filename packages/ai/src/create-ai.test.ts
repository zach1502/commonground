import { describe, expect, it } from 'vitest';

import { loadConfig } from '@parkshape/config';
import { FakeClock } from '@parkshape/core';

import { MemoryLogger } from './adapters/memory/memory-logger.js';
import { createAi, type AiConfig } from './create-ai.js';
import { SUMMARY_INPUT } from './ports/__contracts__/summary-fixtures.js';
import type { HttpFetch } from './ports/llm-client.js';

const RULE_BASED: AiConfig = {
  AI_PROVIDER: 'rule-based',
  AI_BASE_URL: '',
  AI_API_KEY: '',
  AI_MODEL: 'test-model',
  AI_FALLBACK_MODEL: '',
};
const OPENAI_COMPATIBLE: AiConfig = {
  ...RULE_BASED,
  AI_PROVIDER: 'openai-compatible',
  AI_BASE_URL: 'https://m.example.test/v1',
  AI_API_KEY: 'k',
};

const NO_KEY_NOTE = 'No AI_API_KEY, so the fixed rules write the answers.';
const DOG_PARK = 'a dog park in the back corner';
const LOOP_ANSWER = {
  features: [],
  paths: { style: 'loop' },
  canopy: 'add-some',
  character: 'natural',
};

function completionFetch(content: unknown, calls: string[] = []): HttpFetch {
  return (url) => {
    calls.push(url);
    const body = JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] });
    return Promise.resolve({ ok: true, status: 200, text: () => Promise.resolve(body) });
  };
}

const unusedFetch: HttpFetch = () => Promise.reject(new Error('no network in this test'));

describe('createAi', () => {
  it('reads descriptions and summarizes offline with the rule-based provider', async () => {
    const ai = createAi(RULE_BASED, { fetch: unusedFetch, logger: new MemoryLogger() });
    const intent = await ai.intent.parse(DOG_PARK);
    expect(intent.source).toBe('rule-based');
    expect(intent.value.features[0]).toMatchObject({
      category: 'dog',
      placement: { zone: 'south-east' },
    });
    const summary = await ai.summary.summarize(SUMMARY_INPUT);
    expect(summary.source).toBe('rule-based');
    expect(summary.value.themes.length).toBeGreaterThan(0);
  });

  it('answers from the fake client with the fake provider', async () => {
    const ai = createAi(
      { ...RULE_BASED, AI_PROVIDER: 'fake' },
      { fetch: unusedFetch, logger: new MemoryLogger() },
    );
    expect(await ai.summary.summarize(SUMMARY_INPUT)).toEqual({
      source: 'model',
      model: 'fake-model',
      value: { themes: [], tradeoffs: [] },
    });
    expect((await ai.intent.parse('anything')).value.canopy).toBe('maximize');
  });
});

describe('createAi with the OpenAI-compatible provider', () => {
  it('calls the configured endpoint and names the configured model', async () => {
    const calls: string[] = [];
    const answer = {
      features: [],
      paths: { style: 'minimal' },
      canopy: 'keep-existing',
      character: 'active',
    };
    const ai = createAi(
      {
        ...RULE_BASED,
        AI_PROVIDER: 'openai-compatible',
        AI_BASE_URL: 'https://m.example.test/v1',
        AI_API_KEY: 'k',
      },
      { fetch: completionFetch(answer, calls), logger: new MemoryLogger() },
    );
    expect(await ai.intent.parse('something')).toEqual({
      source: 'model',
      model: 'test-model',
      value: answer,
    });
    expect(calls).toEqual(['https://m.example.test/v1/chat/completions']);
  });

  it('falls back to rule-based and logs when the OpenAI-compatible key is missing', async () => {
    const logger = new MemoryLogger();
    const ai = createAi(
      { ...RULE_BASED, AI_PROVIDER: 'openai-compatible', AI_BASE_URL: 'https://m.example.test/v1' },
      { fetch: unusedFetch, logger },
    );
    const intent = await ai.intent.parse(DOG_PARK);
    expect(intent.value.features[0]?.category).toBe('dog');
    expect(logger.warnings).toEqual([NO_KEY_NOTE]);
  });

  it('names the empty base URL when the key is set but AI_BASE_URL is not', async () => {
    const logger = new MemoryLogger();
    const ai = createAi({ ...OPENAI_COMPATIBLE, AI_BASE_URL: '' }, { fetch: unusedFetch, logger });
    expect((await ai.intent.parse(DOG_PARK)).source).toBe('rule-based');
    expect(logger.warnings).toEqual(['No AI_BASE_URL, so the fixed rules write the answers.']);
  });

  it('caches model answers so a repeated description is read once', async () => {
    const calls: string[] = [];
    const ai = createAi(OPENAI_COMPATIBLE, {
      fetch: completionFetch(LOOP_ANSWER, calls),
      logger: new MemoryLogger(),
    });
    await ai.intent.parse('a loop');
    await ai.intent.parse('a loop');
    expect(calls).toHaveLength(1);
  });
});

describe('createAi with the default config', () => {
  it('answers with the fixed rules and one calm note when there is no key', async () => {
    const calls: string[] = [];
    const logger = new MemoryLogger();
    const ai = createAi(loadConfig({}), { fetch: completionFetch(LOOP_ANSWER, calls), logger });
    expect((await ai.intent.parse(DOG_PARK)).source).toBe('rule-based');
    expect((await ai.summary.summarize(SUMMARY_INPUT)).source).toBe('rule-based');
    expect(calls).toEqual([]);
    expect(logger.warnings).toEqual([NO_KEY_NOTE]);
  });
});

describe('createAi with Gemini and failed calls', () => {
  it('calls Gemini when only AI_API_KEY is set', async () => {
    const sent: { url: string; model: unknown }[] = [];
    const fetch: HttpFetch = (url, init) => {
      sent.push({ url, model: (JSON.parse(init.body) as { model?: unknown }).model });
      return completionFetch(LOOP_ANSWER)(url, init);
    };
    const config = loadConfig({ AI_API_KEY: 'k' });
    const ai = createAi(config, { fetch, logger: new MemoryLogger() });
    expect(await ai.intent.parse('a loop')).toMatchObject({ model: 'gemini-3.5-flash-lite' });
    expect(sent).toEqual([
      {
        url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
        model: 'gemini-3.5-flash-lite',
      },
    ]);
  });

  it('asks the model again after a failed call, instead of keeping the rules answer', async () => {
    let failures = 1;
    const flaky: HttpFetch = (url, init) => {
      if (failures === 0) return completionFetch(LOOP_ANSWER)(url, init);
      failures -= 1;
      return Promise.resolve({ ok: false, status: 503, text: () => Promise.resolve('busy') });
    };
    const ai = createAi(OPENAI_COMPATIBLE, { fetch: flaky, logger: new MemoryLogger() });
    expect((await ai.intent.parse('a loop')).source).toBe('rule-based');
    expect(await ai.intent.parse('a loop')).toEqual({
      source: 'model',
      model: 'test-model',
      value: LOOP_ANSWER,
    });
  });
});

const WITH_FALLBACK: AiConfig = { ...OPENAI_COMPATIBLE, AI_FALLBACK_MODEL: 'fallback-model' };
const SUMMARY_ANSWER = { themes: [], tradeoffs: [] };

interface ModelServer {
  readonly fetch: HttpFetch;
  /** The model named in each request body, in order. */
  readonly asked: string[];
}

/** A stub server that answers 429 for the models in `limited` and a completion for the rest. */
function modelServer(limited: readonly string[], reply: { headers?: string; body?: string } = {}) {
  const asked: string[] = [];
  const fetch: HttpFetch = (url, init) => {
    const { model, response_format: format } = JSON.parse(init.body) as {
      model: string;
      response_format: { json_schema: { name: string } };
    };
    asked.push(model);
    if (!limited.includes(model)) {
      const content = format.json_schema.name === 'park-summary' ? SUMMARY_ANSWER : LOOP_ANSWER;
      return completionFetch(content)(url, init);
    }
    const headers = {
      get: (name: string) => (name === 'Retry-After' ? (reply.headers ?? null) : null),
    };
    const text = () => Promise.resolve(reply.body ?? 'quota');
    return Promise.resolve({ ok: false, status: 429, headers, text });
  };
  return { fetch, asked } satisfies ModelServer;
}

function retryInBody(seconds: number): string {
  const retryInfo = {
    '@type': 'type.googleapis.com/google.rpc.RetryInfo',
    retryDelay: `${String(seconds)}s`,
  };
  return JSON.stringify([{ error: { code: 429, details: [retryInfo] } }]);
}

describe('createAi with a fallback model', () => {
  it('asks the fallback after a 429 and names it on the intent and the summary', async () => {
    const server = modelServer(['test-model']);
    const ai = createAi(WITH_FALLBACK, { fetch: server.fetch, logger: new MemoryLogger() });
    expect(await ai.intent.parse('a loop')).toEqual({
      source: 'model',
      model: 'fallback-model',
      value: LOOP_ANSWER,
    });
    expect(await ai.summary.summarize(SUMMARY_INPUT)).toMatchObject({
      source: 'model',
      model: 'fallback-model',
    });
    // The second question skips the first model, which is still cooling down.
    expect(server.asked).toEqual(['test-model', 'fallback-model', 'fallback-model']);
  });

  it('uses the fixed rules when both models answer 429', async () => {
    const server = modelServer(['test-model', 'fallback-model']);
    const logger = new MemoryLogger();
    const ai = createAi(WITH_FALLBACK, { fetch: server.fetch, logger });
    expect((await ai.intent.parse(DOG_PARK)).source).toBe('rule-based');
    expect(server.asked).toEqual(['test-model', 'fallback-model']);
    expect(logger.warnings.at(-1)).toMatch(/^AI intent fell back to rule-based: http 429/);
  });

  it('builds no chain when the fallback is empty or the same model', async () => {
    for (const fallback of ['', 'test-model']) {
      const server = modelServer(['test-model']);
      const config = { ...OPENAI_COMPATIBLE, AI_FALLBACK_MODEL: fallback };
      const ai = createAi(config, { fetch: server.fetch, logger: new MemoryLogger() });
      expect((await ai.intent.parse(DOG_PARK)).source).toBe('rule-based');
      expect(server.asked).toEqual(['test-model']);
    }
  });
});

describe('createAi cooldown after a 429', () => {
  async function firstModelAskedAfter(waitMs: number, reply: { headers?: string; body?: string }) {
    const server = modelServer(['test-model'], reply);
    const clock = new FakeClock(new Date('2026-10-03T12:00:00Z'));
    const ai = createAi(WITH_FALLBACK, { fetch: server.fetch, logger: new MemoryLogger(), clock });
    await ai.intent.parse('first');
    clock.advance(waitMs);
    await ai.intent.parse('second');
    return server.asked[2] === 'test-model';
  }

  it('waits out the Retry-After header', async () => {
    expect(await firstModelAskedAfter(4999, { headers: '5', body: retryInBody(40) })).toBe(false);
    expect(await firstModelAskedAfter(5000, { headers: '5', body: retryInBody(40) })).toBe(true);
  });

  it('waits out the retryDelay in the Gemini body when there is no header', async () => {
    expect(await firstModelAskedAfter(39_999, { body: retryInBody(40) })).toBe(false);
    expect(await firstModelAskedAfter(40_000, { body: retryInBody(40) })).toBe(true);
  });

  it('waits 60 s when the 429 does not say', async () => {
    expect(await firstModelAskedAfter(59_999, {})).toBe(false);
    expect(await firstModelAskedAfter(60_000, {})).toBe(true);
  });
});
