import { z } from 'zod';

import { err, ok, type Result } from '@parkshape/core';

import type {
  Completion,
  HttpFetch,
  HttpResponse,
  LlmClient,
  LlmError,
  LlmRequest,
} from '../../ports/llm-client.js';
import { cutOut, withoutPrompt } from '../../redact.js';

import { retryDelayMs } from './retry-delay.js';
import { toSchemaSubset } from './schema-subset.js';

const MAX_ERROR_CHARS = 200;
const TOO_MANY_REQUESTS = 429;

export interface OpenAiCompatibleOptions {
  /** Up to and including the version segment, such as https://api.openai.com/v1. */
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly fetch: HttpFetch;
}

const completionSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string().min(1) }) })).min(1),
});

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Calls POST {baseUrl}/chat/completions with a json_schema response format, using fetch only. */
export class OpenAiCompatibleClient implements LlmClient {
  readonly model: string;
  readonly #options: OpenAiCompatibleOptions;
  readonly #url: string;

  constructor(options: OpenAiCompatibleOptions) {
    this.model = options.model;
    this.#options = options;
    this.#url = `${options.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  }

  async complete(request: LlmRequest): Promise<Result<Completion, LlmError>> {
    let text: string;
    try {
      const response = await this.#options.fetch(this.#url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.#options.apiKey}`,
        },
        body: JSON.stringify(this.#body(request)),
      });
      text = await response.text();
      if (!response.ok) {
        return err(this.#httpError(response, text, request));
      }
    } catch (error) {
      return err({ kind: 'network', message: this.#redact(describe(error), request) });
    }
    return this.#parse(text);
  }

  #body(request: LlmRequest) {
    return {
      model: this.#options.model,
      max_tokens: request.maxTokens,
      // Structured answers should not vary between identical requests.
      temperature: 0,
      messages: [
        { role: 'system', content: request.system },
        { role: 'user', content: request.user },
      ],
      response_format: {
        type: 'json_schema',
        // Gemini rejects keywords outside its subset; zod still checks the answer in full.
        json_schema: { name: request.schema.name, schema: toSchemaSubset(request.schema.schema) },
      },
    };
  }

  /** The delay hint is read from the whole reply, since the message keeps only its start. */
  #httpError(response: HttpResponse, text: string, request: LlmRequest): LlmError {
    const message = this.#redact(text, request);
    if (response.status !== TOO_MANY_REQUESTS)
      return { kind: 'http', status: response.status, message };
    const retryAfterMs = retryDelayMs(response.headers?.get('Retry-After') ?? null, text);
    return retryAfterMs === undefined
      ? { kind: 'http', status: response.status, message }
      : { kind: 'http', status: response.status, message, retryAfterMs };
  }

  #parse(text: string): Result<Completion, LlmError> {
    let envelope: unknown;
    try {
      envelope = JSON.parse(text);
    } catch (error) {
      return err({ kind: 'bad-envelope', message: describe(error) });
    }
    const parsed = completionSchema.safeParse(envelope);
    if (!parsed.success) {
      return err({ kind: 'bad-envelope', message: z.prettifyError(parsed.error) });
    }
    const content = parsed.data.choices[0]?.message.content ?? '';
    try {
      return ok({ model: this.model, value: JSON.parse(content) as unknown });
    } catch (error) {
      return err({ kind: 'bad-json', message: describe(error) });
    }
  }

  /**
   * Error text can echo the request; keep it short and never include the key or the prompt.
   * The prompt is cut out before the text is shortened, so no partial copy survives the cut.
   */
  #redact(text: string, request: LlmRequest): string {
    const withoutKey = cutOut(text, this.#options.apiKey, '[key]');
    return withoutPrompt(withoutKey, request).slice(0, MAX_ERROR_CHARS);
  }
}
