import { z } from 'zod';

// An opening, closing or comment tag. A lone < or > in plain text, such as "cost < $5,000", is fine.
const HTML_TAG = /<\/?[a-z!][^>]*>/i;

/**
 * Text a person typed, stored and shown as plain text: trimmed, at most `maxChars` characters
 * and with no HTML tags. An empty string passes; callers that need words add `.min(1)`.
 */
export function plainTextSchema(maxChars: number) {
  return z
    .string()
    .trim()
    .max(maxChars)
    .refine((text) => !HTML_TAG.test(text), 'Write it as plain text, with no HTML tags.');
}
