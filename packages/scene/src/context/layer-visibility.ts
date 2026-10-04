import { z } from 'zod';
import { createStore, type StoreApi } from 'zustand/vanilla';

import {
  CONTEXT_FEATURE_KINDS,
  CONTEXT_LAYER_DEFAULTS,
  type ContextFeatureKind,
} from '@parkshape/core';

import type { ContextVisibility } from './layer-plan.js';

/** The part of Web Storage the toggles use, so tests pass a map and the app passes localStorage. */
export interface LayerStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** One key per device: the toggles are a viewing choice, not part of any design. */
export const LAYER_VISIBILITY_KEY = 'parkshape.context-layers';

export interface LayerVisibilityState {
  readonly visible: ContextVisibility;
  readonly toggle: (kind: ContextFeatureKind) => void;
}

const onOff = z.enum(['on', 'off']);
const storedSchema = z.partialRecord(z.enum(CONTEXT_FEATURE_KINDS), onOff);

function readStored(storage: LayerStorage | undefined): ContextVisibility {
  try {
    const text = storage?.getItem(LAYER_VISIBILITY_KEY) ?? null;
    if (text === null) return CONTEXT_LAYER_DEFAULTS;
    const parsed = storedSchema.safeParse(JSON.parse(text));
    return parsed.success ? { ...CONTEXT_LAYER_DEFAULTS, ...parsed.data } : CONTEXT_LAYER_DEFAULTS;
  } catch {
    return CONTEXT_LAYER_DEFAULTS;
  }
}

function writeStored(storage: LayerStorage | undefined, visible: ContextVisibility): void {
  try {
    storage?.setItem(LAYER_VISIBILITY_KEY, JSON.stringify(visible));
  } catch {
    // A full or blocked store only forgets the choice on the next visit.
  }
}

/** The Layers menu toggles, starting from CONTEXT_LAYER_DEFAULTS or this device's last choice. */
export function createLayerVisibility(storage?: LayerStorage): StoreApi<LayerVisibilityState> {
  return createStore<LayerVisibilityState>()((set, get) => ({
    visible: readStored(storage),
    toggle: (kind) => {
      const current = get().visible;
      const visible = { ...current, [kind]: current[kind] === 'on' ? 'off' : 'on' } as const;
      set({ visible });
      writeStored(storage, visible);
    },
  }));
}
