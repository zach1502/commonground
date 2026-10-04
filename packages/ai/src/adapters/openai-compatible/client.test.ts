import { describe, expect, it } from 'vitest';

import { PROBE_REQUEST, llmClientContract } from '../../ports/__contracts__/llm-client.contract.js';
import type { HttpFetch, HttpRequestInit, LlmRequest } from '../../ports/llm-client.js';
import { intentJsonSchema } from '../../schema/intent.js';

import { OpenAiCompatibleClient } from './client.js';
import { toSchemaSubset } from './schema-subset.js';

interface Sent {
  readonly url: string;
  readonly init: HttpRequestInit;
}

function stubFetch(status: number, body: string, sent: Sent[] = []): HttpFetch {
  return (url, init) => {
    sent.push({ url, init });
    return Promise.resolve({ ok: status < 300, status, text: () => Promise.resolve(body) });
  };
}

/** A 429 whose headers say how long to wait, as a real fetch Response carries them. */
function rateLimited(body: string, retryAfter: string | null): HttpFetch {
  const headers = { get: (name: string) => (name === 'Retry-After' ? retryAfter : null) };
  return () =>
    Promise.resolve({ ok: false, status: 429, headers, text: () => Promise.resolve(body) });
}

const RETRY_IN_31S = JSON.stringify([
  {
    error: {
      code: 429,
      message: 'x'.repeat(300),
      details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '31s' }],
    },
  },
]);

function completion(content: string | null): string {
  return JSON.stringify({ choices: [{ message: { role: 'assistant', content } }] });
}

function clientWith(fetch: HttpFetch) {
  return new OpenAiCompatibleClient({
    baseUrl: 'https://models.example.test/v1/',
    apiKey: 'test-key',
    model: 'test-model',
    fetch,
  });
}

llmClientContract('OpenAiCompatibleClient', () =>
  clientWith(stubFetch(200, completion('{"answer":"ok"}'))),
);

describe('OpenAiCompatibleClient', () => {
  it('posts a chat completion with a json_schema response format', async () => {
    const sent: Sent[] = [];
    await clientWith(stubFetch(200, completion('{"answer":"ok"}'), sent)).complete(PROBE_REQUEST);
    expect(sent[0]?.url).toBe('https://models.example.test/v1/chat/completions');
    expect(sent[0]?.init.headers.Authorization).toBe('Bearer test-key');
    expect(JSON.parse(sent[0]?.init.body ?? '')).toEqual({
      model: 'test-model',
      max_tokens: 50,
      temperature: 0,
      messages: [
        { role: 'system', content: PROBE_REQUEST.system },
        { role: 'user', content: PROBE_REQUEST.user },
      ],
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'contract-probe', schema: PROBE_REQUEST.schema.schema },
      },
    });
  });

  it('returns an http error with the status for a non-2xx answer', async () => {
    const result = await clientWith(stubFetch(429, 'slow down')).complete(PROBE_REQUEST);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'http', status: 429, message: 'slow down' },
    });
  });

  it('returns a network error when fetch throws', async () => {
    const failing: HttpFetch = () => Promise.reject(new Error('connection refused'));
    const result = await clientWith(failing).complete(PROBE_REQUEST);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'network', message: 'connection refused' },
    });
  });

  it('returns bad-envelope when the body is not a chat completion', async () => {
    const result = await clientWith(stubFetch(200, '{"nope":true}')).complete(PROBE_REQUEST);
    expect(result.ok ? undefined : result.error.kind).toBe('bad-envelope');
    const refused = await clientWith(stubFetch(200, completion(null))).complete(PROBE_REQUEST);
    expect(refused.ok ? undefined : refused.error.kind).toBe('bad-envelope');
  });

  it('returns bad-json when the message content is not JSON', async () => {
    const result = await clientWith(stubFetch(200, completion('Sure, here you go'))).complete(
      PROBE_REQUEST,
    );
    expect(result.ok ? undefined : result.error.kind).toBe('bad-json');
  });

  it('never puts the key in an error message', async () => {
    const result = await clientWith(stubFetch(401, 'bad key test-key')).complete(PROBE_REQUEST);
    expect(JSON.stringify(result)).not.toContain('test-key');
  });
});

describe('OpenAiCompatibleClient answers and 429s', () => {
  it('names its model on the answer', async () => {
    const result = await clientWith(stubFetch(200, completion('{"answer":"ok"}'))).complete(
      PROBE_REQUEST,
    );
    expect(result).toEqual({ ok: true, value: { model: 'test-model', value: { answer: 'ok' } } });
  });

  it('keeps the Retry-After header of a 429 as retryAfterMs', async () => {
    const result = await clientWith(rateLimited('slow down', '12')).complete(PROBE_REQUEST);
    expect(result).toEqual({
      ok: false,
      error: { kind: 'http', status: 429, message: 'slow down', retryAfterMs: 12_000 },
    });
  });

  it('reads retryDelay from the whole 429 body, past the cut in the message', async () => {
    const result = await clientWith(rateLimited(RETRY_IN_31S, null)).complete(PROBE_REQUEST);
    expect(result).toMatchObject({ ok: false, error: { status: 429, retryAfterMs: 31_000 } });
    expect(result.ok ? '' : JSON.stringify(result.error)).not.toContain('RetryInfo');
  });
});

describe('OpenAiCompatibleClient error text', () => {
  const resident: LlmRequest = { ...PROBE_REQUEST, user: 'Plant "tall" cedars\nfor Maya' };

  it('never puts the prompt in an error message, raw or JSON-escaped', async () => {
    const echo = JSON.stringify({ error: { message: `${resident.system} ${resident.user}` } });
    const reply = `${echo} raw: ${resident.user}`;
    const result = await clientWith(stubFetch(422, reply)).complete(resident);
    expect(result).toMatchObject({ ok: false, error: { kind: 'http', status: 422 } });
    expect(JSON.stringify(result)).not.toMatch(/cedars|Maya|Reply with a JSON/);
    expect(JSON.stringify(result)).toContain('[prompt]');
  });

  it('cuts the prompt out before it shortens the reply', async () => {
    // The echo starts 5 characters before the 200-character cut.
    const reply = `${'x'.repeat(195)}${resident.user}`;
    const result = await clientWith(stubFetch(422, reply)).complete(resident);
    expect(JSON.stringify(result)).not.toContain('Plant');
  });
});

describe('OpenAiCompatibleClient request schema', () => {
  it('sends the real intent schema cut down to the keywords Gemini accepts', async () => {
    const sent: Sent[] = [];
    const client = clientWith(stubFetch(200, completion('{"answer":"ok"}'), sent));
    await client.complete({ ...PROBE_REQUEST, schema: intentJsonSchema });
    expect(sent[0]?.init.body).not.toMatch(/minLength|maxLength/);
    expect(JSON.parse(sent[0]?.init.body ?? '')).toMatchObject({
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'park-intent', schema: toSchemaSubset(intentJsonSchema.schema) },
      },
    });
  });
});
