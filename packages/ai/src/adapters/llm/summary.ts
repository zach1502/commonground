import { byModel, type Sourced } from '../../answer-source.js';
import type { SummaryProvider } from '../../ports/summary-provider.js';
import {
  modelSummarySchema,
  summaryIssues,
  summaryJsonSchema,
  type Summary,
} from '../../schema/summary.js';
import type { SummaryInput } from '../../types.js';
import { commentLineOf } from '../rule-based/comment-line.js';

import { askModel, MODEL_MAX_TOKENS, type LlmProviderDeps } from './ask.js';
import { summaryPrompt } from './prompts.js';

/**
 * Asks the model for themes and tradeoffs and adds the comment line from counts; any failure
 * returns the fallback's summary.
 */
export class LlmSummaryProvider implements SummaryProvider {
  readonly #deps: LlmProviderDeps<SummaryProvider>;

  constructor(deps: LlmProviderDeps<SummaryProvider>) {
    this.#deps = deps;
  }

  async summarize(input: SummaryInput): Promise<Sourced<Summary>> {
    const { client, logger, fallback } = this.#deps;
    const answer = await askModel(client, logger, {
      label: 'summary',
      request: {
        ...summaryPrompt(input),
        schema: summaryJsonSchema,
        maxTokens: MODEL_MAX_TOKENS,
      },
      schema: modelSummarySchema,
      problems: (summary) => summaryIssues(summary, input.topDesigns),
    });
    // The fallback says who wrote its own answer, so a failed call is never credited to the model.
    if (answer === undefined) return fallback.summarize(input);
    return byModel(answer.model, { ...answer.value, ...commentLineOf(input.elementFeedback) });
  }
}
