import type { z } from 'zod';

import type { LlmClient, LlmError, LlmRequest } from '../../ports/llm-client.js';
import type { Logger } from '../../ports/logger.js';
import { withoutPrompt } from '../../redact.js';

/**
 * max_tokens for every structured answer. Gemini 3 models always think, and Google counts the
 * thinking and the visible answer against this one cap, so 800 could leave the answer empty.
 * Both answers are small JSON, so this is headroom for thinking, not a longer answer.
 */
export const MODEL_MAX_TOKENS = 4096;

/** How much of an http error body the fallback warning keeps. */
export const MAX_LOGGED_BODY_CHARS = 200;

/**
 * The warning's reason: the error kind, and for http also the status and the start of the
 * server's reply on one line. The client has already cut the key out of that reply. Any copy
 * of the system prompt or the resident's text is cut out here too, before the reply is
 * shortened, so the request body and the prompt are never logged whichever client answered.
 */
function failureReason(error: LlmError, request: LlmRequest): string {
  if (error.kind !== 'http') return error.kind;
  const body = withoutPrompt(error.message, request)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_LOGGED_BODY_CHARS);
  return `http ${String(error.status)} ${body}`;
}

export interface LlmProviderDeps<F> {
  readonly client: LlmClient;
  /** Answers when the model fails, times out or returns something that does not validate. */
  readonly fallback: F;
  readonly logger: Logger;
}

export interface Question<T> {
  /** Names the provider in the fallback warning, such as "summary". */
  readonly label: string;
  readonly request: LlmRequest;
  readonly schema: z.ZodType<T>;
  /** Extra checks on a valid answer; any message sends the caller to the fallback. */
  readonly problems?: (answer: T) => readonly string[];
}

/** A validated answer and the model that wrote it, which may not be the client's first model. */
export interface ModelAnswer<T> {
  readonly model: string;
  readonly value: T;
}

/** The model's validated answer, or undefined after logging why the caller must fall back. */
export async function askModel<T>(
  client: LlmClient,
  logger: Logger,
  question: Question<T>,
): Promise<ModelAnswer<T> | undefined> {
  const warn = (reason: string) => {
    logger.warn(`AI ${question.label} fell back to rule-based: ${reason}`);
  };
  const result = await client.complete(question.request);
  if (!result.ok) {
    warn(failureReason(result.error, question.request));
    return undefined;
  }
  const parsed = question.schema.safeParse(result.value.value);
  if (!parsed.success) {
    // Issue paths only: messages can quote the model's text back.
    warn(`schema (${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')})`);
    return undefined;
  }
  const problems = question.problems?.(parsed.data) ?? [];
  if (problems.length > 0) {
    warn(`inconsistent (${String(problems.length)} problems)`);
    return undefined;
  }
  return { model: result.value.model, value: parsed.data };
}
