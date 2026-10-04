import { describe, expect, it } from 'vitest';

import { COMPASS_ZONES, intentSchema, MAX_DESCRIPTION_CHARS } from './intent.js';

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

  it('accepts a count of 0, which asks for none of a feature', () => {
    const features = [{ catalogId: 'community-garden', count: 0 }];
    expect(intentSchema.parse({ ...BASE, features }).features[0]?.count).toBe(0);
    expect(
      intentSchema.safeParse({ ...BASE, features: [{ ...features[0], count: -1 }] }).success,
    ).toBe(false);
  });

  it('rejects unknown keys', () => {
    expect(intentSchema.safeParse({ ...BASE, features: [], extra: 1 }).success).toBe(false);
  });

  it('has eight compass zones and the centre', () => {
    expect(COMPASS_ZONES).toHaveLength(9);
    expect(COMPASS_ZONES).toContain('centre');
  });

  it('accepts descriptions of up to 400 characters', () => {
    expect(MAX_DESCRIPTION_CHARS).toBe(400);
  });
});
