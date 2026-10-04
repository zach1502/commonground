import { byModel, type Sourced } from '../../answer-source.js';
import type { IntentProvider } from '../../ports/intent-provider.js';
import { intentJsonSchema, intentSchema, type Intent } from '../../schema/intent.js';

import { askModel, MODEL_MAX_TOKENS, type LlmProviderDeps } from './ask.js';
import { intentPrompt } from './prompts.js';

export { MAX_DESCRIPTION_CHARS } from './prompts.js';

/** Asks the model to read a description; any failure returns the fallback's reading. */
export class LlmIntentProvider implements IntentProvider {
  readonly #deps: LlmProviderDeps<IntentProvider>;

  constructor(deps: LlmProviderDeps<IntentProvider>) {
    this.#deps = deps;
  }

  async parse(text: string): Promise<Sourced<Intent>> {
    const { client, logger, fallback } = this.#deps;
    const answer = await askModel(client, logger, {
      label: 'intent',
      request: { ...intentPrompt(text), schema: intentJsonSchema, maxTokens: MODEL_MAX_TOKENS },
      schema: intentSchema,
    });
    // The fallback says who wrote its own answer, so a failed call is never credited to the model.
    return answer === undefined ? fallback.parse(text) : byModel(answer.model, answer.value);
  }
}
