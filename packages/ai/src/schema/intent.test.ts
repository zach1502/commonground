import { describe, expect, it } from 'vitest';

import { intentJsonSchema, intentSchema, ZONES } from './intent.js';

const BASE = { paths: { style: 'loop' }, canopy: 'maximize', character: 'natural' } as const;

describe('intentSchema', () => {
  it('accepts a feature named by catalog id or by category', () => {
    const intent = intentSchema.parse({
      ...BASE,
      features: [
        { catalogId: 'pond', count: 1, placement: { terrain: 'low' } },
        { category: 'dog', count: 1, size: 'large', placement: { zone: 'south-east' } },
      ],
    });
    expect(intent.features).toHaveLength(2);
  });

  it('rejects a feature with neither a catalog id nor a category', () => {
    expect(intentSchema.safeParse({ ...BASE, features: [{ count: 1 }] }).success).toBe(false);
  });

  it('rejects catalog ids that are not in the catalog', () => {
    const features = [{ catalogId: 'hot-tub', count: 1 }];
    expect(intentSchema.safeParse({ ...BASE, features }).success).toBe(false);
  });

  it('rejects unknown keys so model output cannot smuggle fields', () => {
    expect(intentSchema.safeParse({ ...BASE, features: [], extra: 1 }).success).toBe(false);
  });

  it('has eight compass zones and the centre', () => {
    expect(ZONES).toHaveLength(9);
    expect(ZONES).toContain('centre');
  });
});

describe('intentJsonSchema', () => {
  it('names the schema and lists catalog ids as an enum for the model', () => {
    expect(intentJsonSchema.name).toBe('park-intent');
    expect(JSON.stringify(intentJsonSchema.schema)).toContain('"off-leash-area"');
    expect(intentJsonSchema.schema).not.toHaveProperty('$schema');
  });
});
