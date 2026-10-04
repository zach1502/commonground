import { describe, expect, it } from 'vitest';

import { moduleKitItemSchema } from '../schema/catalog.js';

import { catalogItems } from './catalog.js';
import { moduleKitItems } from './module-kit.js';

describe('moduleKitItems', () => {
  it('has the raised bed, fence post, fence panel, gate and shed', () => {
    expect(moduleKitItems.map((part) => part.id)).toEqual([
      'raised-bed',
      'fence-post',
      'fence-panel',
      'gate',
      'shed',
    ]);
    moduleKitItems.forEach((part) => {
      expect(moduleKitItemSchema.parse(part)).toEqual(part);
    });
  });

  it('tiles fence panels and keeps every other part at a fixed size', () => {
    const policies = Object.fromEntries(moduleKitItems.map((part) => [part.id, part.scalePolicy]));
    expect(policies).toEqual({
      'raised-bed': 'fixed',
      'fence-post': 'fixed',
      'fence-panel': 'tile',
      gate: 'fixed',
      shed: 'fixed',
    });
  });

  it('matches the raised bed to the garden module size', () => {
    const bed = moduleKitItems.find((part) => part.id === 'raised-bed');
    expect(bed).toMatchObject({ widthM: 1.2, depthM: 3 });
  });

  // Uniform scaling keeps each source model's proportions, so these plans follow the models.
  it('sizes the post, gate and shed plans to their models', () => {
    const plans = Object.fromEntries(
      moduleKitItems.map((part) => [part.id, { widthM: part.widthM, depthM: part.depthM }]),
    );
    expect(plans).toMatchObject({
      'fence-post': { widthM: 0.19, depthM: 0.19 },
      gate: { widthM: 1.2, depthM: 0.116 },
      shed: { widthM: 2.4, depthM: 2.48 },
    });
  });

  it('does not reuse a catalog id or model key', () => {
    const catalogIds = new Set<string>(catalogItems.map((item) => item.id));
    const modelKeys = new Set(catalogItems.map((item) => item.modelKey));
    moduleKitItems.forEach((part) => {
      expect(catalogIds.has(part.id)).toBe(false);
      expect(modelKeys.has(part.modelKey)).toBe(false);
    });
  });
});
