import {
  catalogIndex,
  createSeededRandom,
  makeFlatHeightmap,
  withGroundOutline,
  type DesignDocument,
  type PlanePoint,
  type Zone,
} from '@parkshape/core';

import { createEditorStore } from '../store/editor-store.js';

import { createEditorContext, type EditorContext } from './context.js';

const SIDE = 60;
const SEED = 7;

/**
 * An editor on a flat 60 m square with a seeded random source, or on the part of it inside an
 * outline. Shared by the action tests.
 */
export function contextFor(
  document: DesignDocument,
  zones: readonly Zone[] = [],
  outline?: readonly PlanePoint[],
): EditorContext {
  const square = makeFlatHeightmap({ width: SIDE, height: SIDE });
  return createEditorContext({
    store: createEditorStore({ document }),
    catalog: catalogIndex,
    random: createSeededRandom(SEED),
    heightmap: outline === undefined ? square : withGroundOutline(square, outline),
    zones,
  });
}
