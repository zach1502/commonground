import type { AppConfig } from '@parkshape/config';
import { SystemClock, type Clock } from '@parkshape/core';

import { FakeLlmClient } from './adapters/fake/fake-llm-client.js';
import { LlmIntentProvider } from './adapters/llm/intent.js';
import { LlmSummaryProvider } from './adapters/llm/summary.js';
import { MemoryCache } from './adapters/memory/memory-cache.js';
import { ModelChainClient } from './adapters/model-chain/model-chain-client.js';
import { OpenAiCompatibleClient } from './adapters/openai-compatible/client.js';
import { RuleBasedIntentProvider } from './adapters/rule-based/intent.js';
import { RuleBasedSummaryProvider } from './adapters/rule-based/summary.js';
import type { Cache } from './ports/cache.js';
import type { IntentProvider } from './ports/intent-provider.js';
import type { HttpFetch, LlmClient } from './ports/llm-client.js';
import type { Logger } from './ports/logger.js';
import type { SummaryProvider } from './ports/summary-provider.js';
import { SafeIntentProvider, SafeSummaryProvider } from './safe-providers.js';

export type AiConfig = Pick<
  AppConfig,
  'AI_PROVIDER' | 'AI_BASE_URL' | 'AI_API_KEY' | 'AI_MODEL' | 'AI_FALLBACK_MODEL'
>;

export interface AiDeps {
  readonly fetch: HttpFetch;
  readonly logger: Logger;
  /** Defaults to an in-process cache. */
  readonly cache?: Cache;
  /** Times the skip after a 429; defaults to the system clock. */
  readonly clock?: Clock;
}

export interface Ai {
  readonly summary: SummaryProvider;
  readonly intent: IntentProvider;
}

/** The setting a model call needs that is still empty, if there is one. */
function missingModelSetting(config: AiConfig): 'AI_API_KEY' | 'AI_BASE_URL' | undefined {
  if (config.AI_API_KEY === '') return 'AI_API_KEY';
  return config.AI_BASE_URL === '' ? 'AI_BASE_URL' : undefined;
}

/** The model client for the configured provider, or undefined for the rule-based path. */
function modelClient(config: AiConfig, deps: AiDeps): LlmClient | undefined {
  switch (config.AI_PROVIDER) {
    case 'rule-based':
      return undefined;
    case 'fake':
      return new FakeLlmClient();
    case 'openai-compatible': {
      const missing = missingModelSetting(config);
      if (missing !== undefined) {
        // Gemini is the default, so an empty key is the normal offline setup and this is a plain
        // note. The Logger port has no info level, so it goes out through warn, once per start.
        deps.logger.warn(`No ${missing}, so the fixed rules write the answers.`);
        return undefined;
      }
      return httpModelClient(config, deps);
    }
  }
}

/** One HTTP client for AI_MODEL, chained to one for AI_FALLBACK_MODEL when that is another model. */
function httpModelClient(config: AiConfig, deps: AiDeps): LlmClient {
  const clientFor = (model: string) =>
    new OpenAiCompatibleClient({
      baseUrl: config.AI_BASE_URL,
      apiKey: config.AI_API_KEY,
      model,
      fetch: deps.fetch,
    });
  const primary = clientFor(config.AI_MODEL);
  const fallback = config.AI_FALLBACK_MODEL;
  if (fallback === '' || fallback === config.AI_MODEL) return primary;
  return new ModelChainClient({
    clients: [primary, clientFor(fallback)],
    clock: deps.clock ?? new SystemClock(),
    logger: deps.logger,
  });
}

/**
 * Builds the summary and intent providers named by AI_PROVIDER. The rule-based providers are
 * always there as the fallback, and every answer is filtered and cached on the way out.
 */
export function createAi(config: AiConfig, deps: AiDeps): Ai {
  const cache = deps.cache ?? new MemoryCache();
  const ruleSummary = new RuleBasedSummaryProvider();
  const ruleIntent = new RuleBasedIntentProvider();
  const client = modelClient(config, deps);
  const summary =
    client === undefined
      ? ruleSummary
      : new LlmSummaryProvider({ client, fallback: ruleSummary, logger: deps.logger });
  const intent =
    client === undefined
      ? ruleIntent
      : new LlmIntentProvider({ client, fallback: ruleIntent, logger: deps.logger });
  return {
    summary: new SafeSummaryProvider({ inner: summary, cache }),
    intent: new SafeIntentProvider({ inner: intent, cache }),
  };
}
