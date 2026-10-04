import { z } from 'zod';

/**
 * Who wrote an answer: the fixed rules, or the language model it names. Pages read this to say
 * which one wrote a summary, so a model that failed and fell back is never credited.
 */
export type AnswerSource =
  { readonly source: 'rule-based' } | { readonly source: 'model'; readonly model: string };

/** A provider's answer together with who wrote it. */
export type Sourced<T> = AnswerSource & { readonly value: T };

export function byRules<T>(value: T): Sourced<T> {
  return { source: 'rule-based', value };
}

export function byModel<T>(model: string, value: T): Sourced<T> {
  return { source: 'model', model, value };
}

/** The same answer with a new value, such as the value after the content filter. */
export function withValue<T, U>(answer: Sourced<T>, value: U): Sourced<U> {
  return answer.source === 'model' ? byModel(answer.model, value) : byRules(value);
}

/** The source fields alone, for a response that puts them next to the answer's own fields. */
export function sourceOf(answer: Sourced<unknown>): AnswerSource {
  return answer.source === 'model'
    ? { source: 'model', model: answer.model }
    : { source: 'rule-based' };
}

const modelNameSchema = z.string().regex(/\S/);

/** A model's answer as the cache stores it; a rules answer is never stored. */
export function modelAnswerSchema<T>(value: z.ZodType<T>) {
  return z.strictObject({ source: z.literal('model'), model: modelNameSchema, value });
}

/** Any provider answer: the value, and either the rules or a model that has a name. */
export function sourcedSchema<T>(value: z.ZodType<T>) {
  return z.discriminatedUnion('source', [
    z.strictObject({ source: z.literal('rule-based'), value }),
    modelAnswerSchema(value),
  ]);
}
