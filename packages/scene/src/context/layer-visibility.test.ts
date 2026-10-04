import { describe, expect, it } from 'vitest';

import { CONTEXT_LAYER_DEFAULTS } from '@parkshape/core';

import {
  createLayerVisibility,
  LAYER_VISIBILITY_KEY,
  type LayerStorage,
} from './layer-visibility.js';

function memoryStorage(initial: Record<string, string> = {}): LayerStorage & {
  readonly values: Map<string, string>;
} {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
  };
}

describe('createLayerVisibility', () => {
  it('starts from the defaults: streets, sidewalks and bus stops on', () => {
    const store = createLayerVisibility(memoryStorage());
    expect(store.getState().visible).toEqual(CONTEXT_LAYER_DEFAULTS);
  });

  it('flips one layer and keeps the choice on this device', () => {
    const storage = memoryStorage();
    const store = createLayerVisibility(storage);
    store.getState().toggle('parking');
    expect(store.getState().visible.parking).toBe('on');
    const again = createLayerVisibility(storage);
    expect(again.getState().visible.parking).toBe('on');
    expect(again.getState().visible.street).toBe('on');
  });

  it('ignores a stored value it cannot read and falls back to the defaults', () => {
    const storage = memoryStorage({ [LAYER_VISIBILITY_KEY]: '{"street":"maybe"' });
    expect(createLayerVisibility(storage).getState().visible).toEqual(CONTEXT_LAYER_DEFAULTS);
  });

  it('keeps working when the device refuses to store the choice', () => {
    const store = createLayerVisibility({
      getItem: () => null,
      setItem: () => {
        throw new Error('quota');
      },
    });
    store.getState().toggle('street');
    expect(store.getState().visible.street).toBe('off');
  });

  it('works with no storage at all', () => {
    const store = createLayerVisibility();
    store.getState().toggle('bikeway');
    expect(store.getState().visible.bikeway).toBe('on');
  });
});
