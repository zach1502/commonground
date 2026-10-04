import type { LlmRequest } from './ports/llm-client.js';

/** Stands in for the system prompt or the resident's text in error text that may be logged. */
export const PROMPT_PLACEHOLDER = '[prompt]';

/**
 * Replaces every copy of `needle` in `text` with `placeholder`. A server that echoes the request
 * usually quotes it inside a JSON string, so the JSON-escaped form is cut out as well.
 */
export function cutOut(text: string, needle: string, placeholder: string): string {
  if (needle === '') return text;
  const escaped = JSON.stringify(needle).slice(1, -1);
  return text.split(needle).join(placeholder).split(escaped).join(placeholder);
}

/** Error text with the request's system prompt and user text cut out, so it is safe to log. */
export function withoutPrompt(text: string, request: Pick<LlmRequest, 'system' | 'user'>): string {
  const withoutUser = cutOut(text, request.user, PROMPT_PLACEHOLDER);
  return cutOut(withoutUser, request.system, PROMPT_PLACEHOLDER);
}
