import { describe, expect, it } from 'vitest';

import { loadConfigFromProcess } from '@parkshape/config';

import { MODEL_MAX_TOKENS } from '../adapters/llm/ask.js';
import { intentPrompt, summaryPrompt } from '../adapters/llm/prompts.js';
import { OpenAiCompatibleClient } from '../adapters/openai-compatible/client.js';
import { createAi } from '../create-ai.js';
import { SUMMARY_INPUT } from '../ports/__contracts__/summary-fixtures.js';
import { intentJsonSchema, intentSchema } from '../schema/intent.js';
import { modelSummarySchema, summaryJsonSchema } from '../schema/summary.js';

// @live: calls the endpoint in AI_BASE_URL with AI_API_KEY and AI_MODEL. It runs only when
// PARKSHAPE_LIVE=1 and a key is set, so it is safe to run by hand with no setup. The base URL
// and model default to Gemini, so `PARKSHAPE_LIVE=1 AI_API_KEY=<key> pnpm --filter
// @parkshape/ai test:live` is enough. vitest.config.ts leaves src/__live__ out of normal runs.
const config = loadConfigFromProcess();
const ENABLED = config.PARKSHAPE_LIVE === '1' && config.AI_API_KEY !== '';
const TIMEOUT_MS = 60_000;
const LIVE = { timeout: TIMEOUT_MS };
const DOG_PARK = 'a dog park in the back corner and a pond on the low side';

function liveClient() {
  return new OpenAiCompatibleClient({
    baseUrl: config.AI_BASE_URL,
    apiKey: config.AI_API_KEY,
    model: config.AI_MODEL,
    fetch: globalThis.fetch,
  });
}

describe.skipIf(!ENABLED)('@live OpenAI-compatible endpoint', () => {
  it('answers a JSON-schema request with JSON', LIVE, async () => {
    const result = await liveClient().complete({
      system: 'Reply with a JSON object that has one string field named answer.',
      user: 'Say ok.',
      schema: {
        name: 'live-probe',
        schema: {
          type: 'object',
          properties: { answer: { type: 'string' } },
          required: ['answer'],
          additionalProperties: false,
        },
      },
      // Thinking models count their thinking against this cap, so a small cap can leave no answer.
      maxTokens: MODEL_MAX_TOKENS,
    });
    const answer: unknown = result.ok
      ? (result.value.value as { answer?: unknown }).answer
      : undefined;
    expect(typeof answer).toBe('string');
  });

  it('reads the dog park sentence into an intent the model wrote', LIVE, async () => {
    const warnings: string[] = [];
    const ai = createAi(
      { ...config, AI_PROVIDER: 'openai-compatible' },
      { fetch: globalThis.fetch, logger: { warn: (message) => warnings.push(message) } },
    );
    const answer = await ai.intent.parse(DOG_PARK);
    expect(answer).toMatchObject({ source: 'model', model: config.AI_MODEL });
    expect(intentSchema.safeParse(answer.value).success).toBe(true);
    expect(warnings).toEqual([]);
  });
});

// These send the app's real requests, so a pass shows the endpoint accepts the cut-down schema.
describe.skipIf(!ENABLED)('@live OpenAI-compatible endpoint with the app schemas', () => {
  it('accepts the real intent request and answers a valid intent', LIVE, async () => {
    const result = await liveClient().complete({
      ...intentPrompt(DOG_PARK),
      schema: intentJsonSchema,
      maxTokens: MODEL_MAX_TOKENS,
    });
    expect(result.ok ? 'ok' : result.error).toBe('ok');
    expect(intentSchema.safeParse(result.ok ? result.value.value : undefined).success).toBe(true);
  });

  it('accepts the real summary request and answers a valid summary', LIVE, async () => {
    const result = await liveClient().complete({
      ...summaryPrompt(SUMMARY_INPUT),
      schema: summaryJsonSchema,
      maxTokens: MODEL_MAX_TOKENS,
    });
    expect(result.ok ? 'ok' : result.error).toBe('ok');
    expect(modelSummarySchema.safeParse(result.ok ? result.value.value : undefined).success).toBe(
      true,
    );
  });
});
