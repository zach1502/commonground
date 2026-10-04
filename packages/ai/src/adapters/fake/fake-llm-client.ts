import { err, ok, type Result } from '@parkshape/core';

import type { Completion, LlmClient, LlmError, LlmRequest } from '../../ports/llm-client.js';

import { FAKE_ANSWERS } from './fake-answers.js';

/** The name the fake gives as its model, so a page shows when canned answers were used. */
const FAKE_MODEL = 'fake-model';

/** Answers from a fixed table keyed by schema name; for tests and offline demos. */
export class FakeLlmClient implements LlmClient {
  readonly model = FAKE_MODEL;
  readonly requests: LlmRequest[] = [];
  readonly #answers: Readonly<Record<string, unknown>>;

  constructor(answers: Readonly<Record<string, unknown>> = FAKE_ANSWERS) {
    this.#answers = answers;
  }

  complete(request: LlmRequest): Promise<Result<Completion, LlmError>> {
    this.requests.push(request);
    const name = request.schema.name;
    if (!Object.hasOwn(this.#answers, name)) {
      return Promise.resolve(err({ kind: 'no-answer', schemaName: name }));
    }
    const value = JSON.parse(JSON.stringify(this.#answers[name])) as unknown;
    return Promise.resolve(ok({ model: this.model, value }));
  }
}
