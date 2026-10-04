/** The two first-visit hints. Each ends when the resident does the thing it teaches. */
export type HintId = 'camera' | 'path';

export type HintStatus = 'pending' | 'dismissed';

/** What dismisses a hint on its own: the camera moved, or the first path point went down. */
export type HintEvent = 'camera-moved' | 'path-point-added';

export interface HintsState {
  readonly camera: HintStatus;
  readonly path: HintStatus;
}

export const HINTS_START: HintsState = { camera: 'pending', path: 'pending' };

/** Planners and returning residents get no hints. */
export const HINTS_DISMISSED: HintsState = { camera: 'dismissed', path: 'dismissed' };

export function hintsStorageKey(userId: string): string {
  return `parkshape.hints.${userId}`;
}

const EVENT_HINT: Readonly<Record<HintEvent, HintId>> = {
  'camera-moved': 'camera',
  'path-point-added': 'path',
};

export function dismissHint(state: HintsState, id: HintId): HintsState {
  return state[id] === 'dismissed' ? state : { ...state, [id]: 'dismissed' };
}

export function advanceHints(state: HintsState, event: HintEvent): HintsState {
  return dismissHint(state, EVENT_HINT[event]);
}

/** Stores the dismissed ids; anything else is still pending. */
export function serialiseHints(state: HintsState): string {
  const dismissed: HintId[] = [];
  if (state.camera === 'dismissed') dismissed.push('camera');
  if (state.path === 'dismissed') dismissed.push('path');
  return dismissed.join(',');
}

export function parseHints(stored: string | null): HintsState {
  const dismissed = new Set((stored ?? '').split(',').filter((entry) => entry !== ''));
  return {
    camera: dismissed.has('camera') ? 'dismissed' : 'pending',
    path: dismissed.has('path') ? 'dismissed' : 'pending',
  };
}
