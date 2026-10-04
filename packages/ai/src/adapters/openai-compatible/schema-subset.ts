/**
 * The JSON Schema keywords Gemini's structured output accepts, from
 * https://ai.google.dev/gemini-api/docs/structured-output (read 2026-10-03). OpenAI accepts a
 * schema made of these too, since this client never asks for strict mode.
 */
export const SUBSET_KEYWORDS: ReadonlySet<string> = new Set([
  'type',
  'title',
  'description',
  'properties',
  'required',
  'additionalProperties',
  'enum',
  'format',
  'minimum',
  'maximum',
  'items',
  'prefixItems',
  'minItems',
  'maxItems',
  'anyOf',
  '$ref',
  '$defs',
]);

// Keywords whose value maps names to schemas, holds a list of schemas, or is one schema.
const NAMED_SCHEMAS: ReadonlySet<string> = new Set(['properties', '$defs']);
const SCHEMA_LISTS: ReadonlySet<string> = new Set(['anyOf', 'prefixItems']);
const ONE_SCHEMA: ReadonlySet<string> = new Set(['items', 'additionalProperties']);

type SchemaObject = Readonly<Record<string, unknown>>;

function isSchemaObject(value: unknown): value is SchemaObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function subsetOfNode(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(subsetOfNode);
  // additionalProperties can be false, so anything but an object passes through as it is.
  return isSchemaObject(node) ? toSchemaSubset(node) : node;
}

function subsetOfValue(keyword: string, value: unknown): unknown {
  if (NAMED_SCHEMAS.has(keyword) && isSchemaObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([name, schema]) => [name, subsetOfNode(schema)]),
    );
  }
  return SCHEMA_LISTS.has(keyword) || ONE_SCHEMA.has(keyword) ? subsetOfNode(value) : value;
}

/**
 * A copy of a JSON schema that keeps only SUBSET_KEYWORDS and turns `const: x` into
 * `enum: [x]`. Only the schema sent to the model goes through this: zod still checks every
 * answer against the full schema, so a dropped rule such as maxLength is still enforced.
 */
export function toSchemaSubset(schema: SchemaObject): Record<string, unknown> {
  const entries = Object.entries(schema).flatMap(([keyword, value]): [string, unknown][] => {
    if (keyword === 'const') return [['enum', [value]]];
    return SUBSET_KEYWORDS.has(keyword) ? [[keyword, subsetOfValue(keyword, value)]] : [];
  });
  return Object.fromEntries(entries);
}
