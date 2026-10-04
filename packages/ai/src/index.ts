export { createAi, type Ai, type AiConfig, type AiDeps } from './create-ai.js';
export { sourceOf, type AnswerSource, type Sourced } from './answer-source.js';
export { digestDesign, type DigestSource } from './design-digest.js';
export { cleanText, contentProblems, filterIntent, filterSummary } from './filter.js';
export { truncateForModel } from './truncate.js';
export {
  intentSchema,
  MAX_DESCRIPTION_CHARS_ACCEPTED,
  ZONES,
  type Canopy,
  type Character,
  type Intent,
  type IntentFeature,
  type Placement,
  type Zone,
} from './schema/intent.js';
export { summarySchema, type Summary, type Theme, type Tradeoff } from './schema/summary.js';
export type { Cache } from './ports/cache.js';
export type { IntentProvider } from './ports/intent-provider.js';
export type { HttpFetch, HttpRequestInit, HttpResponse, LlmClient } from './ports/llm-client.js';
export type { Logger } from './ports/logger.js';
export type { SummaryProvider } from './ports/summary-provider.js';
export type {
  CommentedElement,
  DesignDigest,
  ElementFeedbackDigest,
  InsightCounts,
  ReasonCounts,
  SummaryInput,
} from './types.js';
