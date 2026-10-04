import { describe, expect, it } from 'vitest';

import { PROBE_REQUEST, llmClientContract } from '../../ports/__contracts__/llm-client.contract.js';
import { intentJsonSchema, intentSchema } from '../../schema/intent.js';
import { summaryJsonSchema, summarySchema } from '../../schema/summary.js';

import { FakeLlmClient } from './fake-llm-client.js';

llmClientContract('FakeLlmClient', () => new FakeLlmClient());

const request = { ...PROBE_REQUEST, system: 'system', user: 'user' };

describe('FakeLlmClient', () => {
  it('answers the summary and intent schemas with valid canned JSON', async () => {
    const client = new FakeLlmClient();
    const summary = await client.complete({ ...request, schema: summaryJsonSchema });
    const intent = await client.complete({ ...request, schema: intentJsonSchema });
    expect(summary.ok && summarySchema.safeParse(summary.value.value).success).toBe(true);
    expect(intent.ok && intentSchema.safeParse(intent.value.value).success).toBe(true);
  });

  it('uses the answers it was given and records each request', async () => {
    const client = new FakeLlmClient({ 'contract-probe': { answer: 'custom' } });
    expect(await client.complete(request)).toEqual({
      ok: true,
      value: { model: 'fake-model', value: { answer: 'custom' } },
    });
    expect(client.requests).toEqual([request]);
  });

  it('fails with no-answer for a schema it has no answer for', async () => {
    const client = new FakeLlmClient({});
    expect(await client.complete(request)).toEqual({
      ok: false,
      error: { kind: 'no-answer', schemaName: 'contract-probe' },
    });
  });
});
