import { describe, expect, it } from 'vitest';

import { catalogIndex } from '../catalog/catalog.js';

import { carryBaseline } from './carry.js';
import { BASELINE, GARDEN_ID, LAWN_ID, neutralIntent } from './fixtures/baseline-site.js';
import type { IntentFeature } from './intent.js';

function carried(features: IntentFeature[]) {
  return carryBaseline(neutralIntent({ features }), BASELINE, catalogIndex);
}

describe('carryBaseline', () => {
  it('keeps the whole baseline when the intent names nothing that is there', () => {
    const carry = carried([{ catalogId: 'bench', count: 2 }]);
    expect(carry.kept.items).toEqual(BASELINE.items);
    expect(carry.kept.areas).toEqual(BASELINE.areas);
    expect(carry.kept.paths).toEqual(BASELINE.paths);
    expect(carry.reworks).toEqual([]);
    expect(carry.intent.features).toEqual([{ catalogId: 'bench', count: 2 }]);
  });

  it('counts an existing garden toward the garden the intent asks for', () => {
    const carry = carried([{ catalogId: 'community-garden', count: 1 }]);
    expect(carry.kept.areas.map((area) => area.id)).toContain(GARDEN_ID);
    expect(carry.intent.features).toEqual([]);
    expect(carry.reworks).toEqual([]);
  });

  it('adds only the gardens beyond the ones already there', () => {
    const carry = carried([{ catalogId: 'community-garden', count: 2 }]);
    expect(carry.intent.features).toEqual([{ catalogId: 'community-garden', count: 1 }]);
  });

  it('removes an unlocked feature the intent asks for none of', () => {
    const carry = carried([
      { catalogId: 'community-garden', count: 0 },
      { catalogId: 'flowering-cherry', count: 0 },
    ]);
    expect(carry.kept.areas.map((area) => area.id)).toEqual([LAWN_ID]);
    expect(carry.kept.items.map((item) => item.catalogId)).toEqual(['western-red-cedar']);
    expect(carry.intent.features).toEqual([]);
  });
});

describe('carryBaseline changes', () => {
  it('never removes a locked feature', () => {
    const carry = carried([{ catalogId: 'western-red-cedar', count: 0 }]);
    expect(carry.kept.items.map((item) => item.id)).toContain('old-cedar');
  });

  it('moves an existing garden when the intent places it, keeping its id and size', () => {
    const carry = carried([
      { catalogId: 'community-garden', count: 1, placement: { zone: 'north' } },
    ]);
    expect(carry.kept.areas.map((area) => area.id)).toEqual([LAWN_ID]);
    const [rework] = carry.reworks;
    expect(rework?.replaces).toMatchObject({ change: 'move', area: { id: GARDEN_ID } });
    expect(rework?.placement).toEqual({ zone: 'north' });
    expect(rework?.sizing).toEqual({ kind: 'box', widthM: 20, depthM: 18 });
  });

  it('resizes an existing garden when the intent gives a size', () => {
    const carry = carried([{ catalogId: 'community-garden', count: 1, size: 'large' }]);
    const [rework] = carry.reworks;
    expect(rework?.replaces?.change).toBe('resize');
    if (rework?.sizing.kind !== 'box') throw new Error('box sizing');
    expect(rework.sizing.widthM * rework.sizing.depthM).toBeCloseTo(20 * 18 * 1.6);
  });

  it('matches existing areas by category when the intent names no catalog id', () => {
    const carry = carried([{ category: 'garden', count: 0 }]);
    expect(carry.kept.areas.map((area) => area.id)).toEqual([LAWN_ID]);
  });
});
