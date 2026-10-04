import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import type { JsonSchema, LlmClient, LlmRequest } from '../llm-client.js';

export const PROBE_SCHEMA: JsonSchema = {
  name: 'contract-probe',
  schema: {
    type: 'object',
    properties: { answer: { type: 'string' } },
    required: ['answer'],
    additionalProperties: false,
  },
};

export const PROBE_REQUEST: LlmRequest = {
  system: 'Reply with a JSON object that has one string field named answer.',
  user: 'Say ok.',
  schema: PROBE_SCHEMA,
  maxTokens: 50,
};

const probeAnswerSchema = z.strictObject({ answer: z.string() });

/** Behaviour every LlmClient adapter must have. Each adapter test calls this with a factory. */
export function llmClientContract(name: string, makeClient: () => LlmClient): void {
  describe(`${name} meets the LlmClient contract`, () => {
    it('answers a fixed prompt with parsed JSON that matches the schema', async () => {
      const result = await makeClient().complete(PROBE_REQUEST);
      expect(result.ok).toBe(true);
      const value = result.ok ? result.value.value : undefined;
      expect(probeAnswerSchema.safeParse(value).success).toBe(true);
    });

    it('names the model it calls first', () => {
      expect(makeClient().model).toMatch(/\S/);
    });

    it('names the model that wrote each answer, so a page can credit it', async () => {
      const result = await makeClient().complete(PROBE_REQUEST);
      expect(result.ok ? result.value.model : '').toMatch(/\S/);
    });
  });
}
