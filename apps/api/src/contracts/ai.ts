import { z } from '@hono/zod-openapi';

import { intentSchema, MAX_DESCRIPTION_CHARS_ACCEPTED, summarySchema } from '@parkshape/ai';

export const intentBodySchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(MAX_DESCRIPTION_CHARS_ACCEPTED)
      .openapi({ example: 'a dog park in the back corner, a pond on the low side, lots of trees' }),
  })
  .openapi('IntentBody');

// The AI package owns these schemas; the meta ids name them in the OpenAPI document.
export const intentResponseSchema = intentSchema.meta({ id: 'Intent' });
export const summaryResponseSchema = summarySchema
  .extend({
    /** Which provider wrote the summary, so the page can say when rules, not a model, did. */
    source: z.enum(['rule-based', 'model']),
    /** The language model that wrote the summary; present only when source is model. */
    model: z.string().min(1).optional(),
    /** How many top designs the summary read; theme counts are out of this. */
    designsRead: z.int().min(0),
  })
  .meta({ id: 'ProjectSummary' });
