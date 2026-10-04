import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { err, ok } from '@parkshape/core';

import { PROBE_REQUEST } from '../../ports/__contracts__/llm-client.contract.js';
import type { HttpFetch, LlmClient, LlmError } from '../../ports/llm-client.js';
import { PROMPT_PLACEHOLDER } from '../../redact.js';
import { MemoryLogger } from '../memory/memory-logger.js';
import { OpenAiCompatibleClient } from '../openai-compatible/client.js';

import { askModel, MAX_LOGGED_BODY_CHARS, type Question } from './ask.js';

const question: Question<{ answer: string }> = {
  label: 'probe',
  request: PROBE_REQUEST,
  schema: z.strictObject({ answer: z.string() }),
};
const PREFIX = 'AI probe fell back to rule-based: ';

function failingWith(error: LlmError): LlmClient {
  return { model: 'test-model', complete: () => Promise.resolve(err(error)) };
}

/** The real HTTP client, against a stub server that always gives this reply. */
function clientReplying(status: number, body: string): LlmClient {
  const reply: HttpFetch = () =>
    Promise.resolve({ ok: false, status, text: () => Promise.resolve(body) });
  return new OpenAiCompatibleClient({
    baseUrl: 'https://models.example.test/v1',
    apiKey: 'k-123',
    model: 'test-model',
    fetch: reply,
  });
}

describe('askModel', () => {
  it('returns the valid answer with the model that wrote it', async () => {
    const client: LlmClient = {
      model: 'first-model',
      complete: () => Promise.resolve(ok({ model: 'second-model', value: { answer: 'ok' } })),
    };
    expect(await askModel(client, new MemoryLogger(), question)).toEqual({
      model: 'second-model',
      value: { answer: 'ok' },
    });
  });

  it('logs only the kind when every model is cooling down', async () => {
    const logger = new MemoryLogger();
    await askModel(failingWith({ kind: 'cooling-down', models: ['a', 'b'] }), logger, question);
    expect(logger.warnings).toEqual([`${PREFIX}cooling-down`]);
  });

  it('logs the status and the start of an http error body on one line', async () => {
    const logger = new MemoryLogger();
    const body = `{"error": {\n  "code": 400,\n  "message": "${'Invalid schema. '.repeat(20)}"\n}}`;
    const client = failingWith({ kind: 'http', status: 400, message: body });
    expect(await askModel(client, logger, question)).toBeUndefined();
    const [line = ''] = logger.warnings;
    expect(line).toMatch(/^AI probe fell back to rule-based: http 400 \{"error": \{ "code": 400, /);
    expect(line).not.toMatch(/\n/);
    expect(line.length).toBe(`${PREFIX}http 400 `.length + MAX_LOGGED_BODY_CHARS);
  });

  it('logs only the kind for a network error', async () => {
    const logger = new MemoryLogger();
    const client = failingWith({ kind: 'network', message: 'connect ECONNREFUSED 10.0.0.1:443' });
    await askModel(client, logger, question);
    expect(logger.warnings).toEqual([`${PREFIX}network`]);
  });

  it('never logs the key or the prompt', async () => {
    const logger = new MemoryLogger();
    await askModel(clientReplying(401, 'bad key k-123'), logger, question);
    expect(logger.warnings).toEqual([`${PREFIX}http 401 bad key [key]`]);
    expect(logger.warnings.join()).not.toContain(PROBE_REQUEST.system);
  });
});

describe('askModel with a reply that echoes the resident', () => {
  const resident: Question<{ answer: string }> = {
    ...question,
    request: { ...PROBE_REQUEST, user: 'Plant "tall" cedars\nby the bench for Maya' },
  };

  it('never logs the resident text that a 422 reply echoes', async () => {
    const logger = new MemoryLogger();
    const echo = JSON.stringify({ error: { code: 422, message: resident.request.user } });
    await askModel(clientReplying(422, echo), logger, resident);
    const [line = ''] = logger.warnings;
    expect(line).toMatch(/^AI probe fell back to rule-based: http 422 /);
    expect(line).not.toMatch(/cedars|Maya/);
    expect(line).toContain(PROMPT_PLACEHOLDER);
  });

  it('cuts the prompt out of any client error before the line is shortened', async () => {
    const logger = new MemoryLogger();
    const message = `${'x'.repeat(MAX_LOGGED_BODY_CHARS - 5)}${resident.request.user}`;
    await askModel(failingWith({ kind: 'http', status: 422, message }), logger, resident);
    expect(logger.warnings.join()).not.toMatch(/Plant|cedars|Maya/);
  });
});
