import { CONTEXT_FEATURE_KINDS, type ContextFeatureKind } from '@parkshape/core';

import type { ContextMeshes } from './context-geometry.js';

/** Which context layers show; the editor's Layers menu sets it, the viewer pages fix it. */
export type ContextVisibility = Readonly<Record<ContextFeatureKind, 'on' | 'off'>>;

/** The meshes the layer draws, one draw call each. */
export type ContextMeshKind = 'apron' | ContextFeatureKind;

/** DESIGN.md Context: the apron and one merged mesh per kind, so 6 draw calls at most. */
export const CONTEXT_DRAW_CALL_BUDGET = 6;

// Drawn in this order: the ground first, the pins last.
const DRAW_ORDER: readonly ContextFeatureKind[] = [
  'street',
  'sidewalk',
  'parking',
  'bikeway',
  'busStop',
];

export function anyLayerOn(visible: ContextVisibility): boolean {
  return CONTEXT_FEATURE_KINDS.some((kind) => visible[kind] === 'on');
}

function hasGeometry(meshes: ContextMeshes, kind: ContextFeatureKind): boolean {
  if (kind === 'busStop') return meshes.busStops.length > 0;
  if (kind === 'parking') return meshes.parking.indices.length > 0;
  return meshes.lines[kind].indices.length > 0;
}

/** The meshes to draw for the layers that are on. The apron shows while any layer is on. */
export function contextDrawPlan(
  meshes: ContextMeshes,
  visible: ContextVisibility,
): ContextMeshKind[] {
  if (!anyLayerOn(visible)) return [];
  const kinds = DRAW_ORDER.filter((kind) => visible[kind] === 'on' && hasGeometry(meshes, kind));
  return ['apron', ...kinds];
}
