import { sidewalkLinesOf, type PlanePoint } from '@parkshape/core';

import type { EntranceTargets } from '../editor/store/types.js';

import type { ContextLoad } from './context-load.js';
import type { ContextVisibility } from './layer-plan.js';

export interface EntranceTargetsInput {
  readonly load: ContextLoad;
  /** The parcel boundary in the editor's local frame. */
  readonly parcel: readonly PlanePoint[];
  readonly visible: ContextVisibility;
}

/**
 * What the entrance snap aims at: the loaded sidewalks while their layer is on. With no context,
 * or the sidewalks hidden, it is null and the grid snap works as before.
 */
export function entranceTargetsFor(input: EntranceTargetsInput): EntranceTargets | null {
  const { load, parcel, visible } = input;
  if (load.kind !== 'ready' || visible.sidewalk === 'off') return null;
  return { parcel, sidewalks: sidewalkLinesOf(load.context) };
}
