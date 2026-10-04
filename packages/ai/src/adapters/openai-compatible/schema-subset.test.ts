import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  intentJsonSchema,
  intentSchema,
  MAX_FEATURE_COUNT,
  MAX_FEATURES,
} from '../../schema/intent.js';
import { MAX_LABEL_CHARS, summaryJsonSchema, summarySchema } from '../../schema/summary.js';

import { SUBSET_KEYWORDS, toSchemaSubset } from './schema-subset.js';

// Their values hold names or plain values, never a schema with keywords of its own.
const NAME_MAPS = new Set(['properties', '$defs']);
const PLAIN_VALUES = new Set(['enum', 'required', 'const']);

/** Every keyword a schema uses at any depth, leaving out property and definition names. */
function keywordsOf(node: unknown, found = new Set<string>()): Set<string> {
  const children = Array.isArray(node) ? node : [];
  children.forEach((child) => keywordsOf(child, found));
  if (typeof node !== 'object' || node === null || Array.isArray(node)) return found;
  for (const [key, value] of Object.entries(node)) {
    found.add(key);
    const next: unknown = NAME_MAPS.has(key) ? Object.values(value as object) : value;
    if (!PLAIN_VALUES.has(key)) keywordsOf(next, found);
  }
  return found;
}

const REAL_SCHEMAS = [intentJsonSchema, summaryJsonSchema];

describe('toSchemaSubset', () => {
  it.each(REAL_SCHEMAS)('keeps only keywords Gemini accepts in $name', ({ schema }) => {
    expect(keywordsOf(schema)).toContain('minLength');
    const kept = [...keywordsOf(toSchemaSubset(schema))];
    expect(kept.filter((keyword) => !SUBSET_KEYWORDS.has(keyword))).toEqual([]);
  });

  it('keeps the shape, enums and bounds of the intent schema', () => {
    const subset = toSchemaSubset(intentJsonSchema.schema);
    const features = 'properties.features';
    const placement = `${features}.items.properties.placement.properties`;
    expect(subset).toMatchObject({ type: 'object', additionalProperties: false });
    expect(subset).toHaveProperty(`${features}.maxItems`, MAX_FEATURES);
    expect(subset).toHaveProperty(`${features}.items.properties.count.maximum`, MAX_FEATURE_COUNT);
    expect(subset).toHaveProperty(`${placement}.zone.enum`, expect.arrayContaining(['centre']));
    expect(subset).toHaveProperty(`${placement}.near.type`, 'string');
    expect(subset).not.toHaveProperty(`${placement}.near.maxLength`);
    expect(subset).toHaveProperty('required', intentJsonSchema.schema.required);
  });

  it('leaves the schema it was given unchanged', () => {
    const before = JSON.stringify(summaryJsonSchema.schema);
    toSchemaSubset(summaryJsonSchema.schema);
    expect(JSON.stringify(summaryJsonSchema.schema)).toBe(before);
  });

  it('leaves zod checking the rules the subset drops', () => {
    const theme = { label: 'x'.repeat(MAX_LABEL_CHARS + 1), designCount: 1, exampleDesignId: 'd' };
    expect(summarySchema.safeParse({ themes: [theme], tradeoffs: [] }).success).toBe(false);
    const near = { features: [{ count: 1, placement: { near: '' } }] };
    const intent = { ...near, paths: { style: 'loop' }, canopy: 'add-some', character: 'active' };
    expect(intentSchema.safeParse(intent).success).toBe(false);
  });
});

describe('toSchemaSubset keywords', () => {
  it('turns const into a one-value enum and drops pattern and exclusiveMinimum', () => {
    const schema = z.toJSONSchema(
      z.strictObject({
        kind: z.literal('dog'),
        count: z.number().positive(),
        code: z.string().regex(/^[a-z]+$/),
      }),
    );
    expect(toSchemaSubset(schema)).toEqual({
      type: 'object',
      properties: {
        kind: { type: 'string', enum: ['dog'] },
        count: { type: 'number' },
        code: { type: 'string' },
      },
      required: ['kind', 'count', 'code'],
      additionalProperties: false,
    });
  });

  it('reads property names as names, even when they match a keyword', () => {
    const schema = {
      type: 'object',
      properties: { pattern: { type: 'string', pattern: 'x' }, title: { type: 'string' } },
      $defs: { minLength: { type: 'integer', exclusiveMaximum: 3 } },
    };
    expect(toSchemaSubset(schema)).toEqual({
      type: 'object',
      properties: { pattern: { type: 'string' }, title: { type: 'string' } },
      $defs: { minLength: { type: 'integer' } },
    });
  });

  it('walks anyOf, prefixItems and schema-valued additionalProperties', () => {
    const schema = {
      anyOf: [{ type: 'string', minLength: 1 }, { type: 'null' }],
      prefixItems: [{ const: 1 }],
      additionalProperties: { type: 'string', pattern: 'y' },
    };
    expect(toSchemaSubset(schema)).toEqual({
      anyOf: [{ type: 'string' }, { type: 'null' }],
      prefixItems: [{ enum: [1] }],
      additionalProperties: { type: 'string' },
    });
  });
});
