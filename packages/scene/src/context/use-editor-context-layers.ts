import { useEffect, useMemo } from 'react';
import { useStore } from 'zustand';

import type { ContextFeatureKind, PlanePoint } from '@parkshape/core';

import type { EditorContext } from '../editor/actions/context.js';

import type { ContextLoad } from './context-load.js';
import type { ContextLayerInput } from './ContextLayer.js';
import { entranceTargetsFor } from './entrance-targets.js';
import type { ContextVisibility } from './layer-plan.js';
import { createLayerVisibility, type LayerStorage } from './layer-visibility.js';

/** What the app hands the editor so it can draw the streets around the park and snap to them. */
export interface EditorSiteContext {
  readonly load: ContextLoad;
  /** The parcel boundary in the editor's local frame, for the entrance snap. */
  readonly parcel: readonly PlanePoint[];
  /** Where the Layers menu keeps its choice on this device; without it the choice lasts the visit. */
  readonly storage?: LayerStorage | undefined;
}

export interface ContextLayersMenuState {
  readonly status: 'ready' | 'failed';
  readonly visible: ContextVisibility;
  readonly onToggle: (kind: ContextFeatureKind) => void;
}

export interface EditorContextLayers {
  /** The 3D layer, once the context is in. */
  readonly layer: ContextLayerInput | undefined;
  /** The Layers menu, once the context has loaded or failed. */
  readonly menu: ContextLayersMenuState | undefined;
}

/**
 * The editor's context layers: the toggles kept on this device, the layer to draw, and the
 * sidewalks the entrance snap aims at while their layer is on.
 */
export function useEditorContextLayers(
  ctx: EditorContext,
  site: EditorSiteContext | undefined,
): EditorContextLayers {
  const storage = site?.storage;
  const store = useMemo(() => createLayerVisibility(storage), [storage]);
  const visible = useStore(store, (state) => state.visible);
  const load = site?.load;
  const parcel = site?.parcel;
  useEffect(() => {
    const targets =
      load === undefined || parcel === undefined
        ? null
        : entranceTargetsFor({ load, parcel, visible });
    ctx.store.getState().setEntranceSnap(targets);
  }, [ctx.store, load, parcel, visible]);
  const { toggle } = store.getState();
  return useMemo(() => {
    if (load === undefined || load.kind === 'loading') return { layer: undefined, menu: undefined };
    const status = load.kind === 'ready' ? 'ready' : 'failed';
    const layer =
      load.kind === 'ready'
        ? { context: load.context, visible, streetNames: 'shown' as const }
        : undefined;
    return { layer, menu: { status, visible, onToggle: toggle } };
  }, [load, visible, toggle]);
}
