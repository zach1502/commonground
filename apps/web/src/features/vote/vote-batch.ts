import type { VoteValue } from '../../api/web-api';

export type BatchPhase = 'viewing' | 'reasons' | 'done';

/** What the voter did with one design in the batch. */
export type VoteResult = 'up' | 'down' | 'skipped';

export interface BatchState {
  /** Index of the current design in the batch. */
  readonly index: number;
  readonly phase: BatchPhase;
  /** The direction of the vote just cast, while the reason chips are open. */
  readonly pendingValue: VoteValue | null;
  /** How many designs the voter has voted on, skips not counted. */
  readonly voted: number;
  /** One result per design already passed, in batch order. */
  readonly results: readonly VoteResult[];
}

export type BatchAction =
  | { readonly type: 'vote'; readonly value: VoteValue }
  | { readonly type: 'skip' }
  | { readonly type: 'reasonsDone' }
  /** A vote changed on the end screen: the design at `index` now reads `result`. */
  | { readonly type: 'change'; readonly index: number; readonly result: VoteResult };

export function initialBatchState(): BatchState {
  return { index: 0, phase: 'viewing', pendingValue: null, voted: 0, results: [] };
}

function resultOf(value: VoteValue | null): VoteResult {
  if (value === null) return 'skipped';
  return value > 0 ? 'up' : 'down';
}

function advance(state: BatchState, total: number): BatchState {
  const index = state.index + 1;
  const phase: BatchPhase = index >= total ? 'done' : 'viewing';
  const results = [...state.results, resultOf(state.pendingValue)];
  return { index, phase, pendingValue: null, voted: state.voted, results };
}

/** The ended batch with one result replaced; the voted count is the results that are votes. */
function changed(state: BatchState, index: number, result: VoteResult): BatchState {
  if (state.phase !== 'done' || index < 0 || index >= state.results.length) return state;
  const results = state.results.map((old, at) => (at === index ? result : old));
  return { ...state, results, voted: results.filter((each) => each !== 'skipped').length };
}

/**
 * Drives one voting batch. A vote opens the reason chips on the same design; Next or Skip reasons
 * (reasonsDone) or a skip moves to the next design. The batch ends after the last design.
 */
export function batchReducer(state: BatchState, action: BatchAction, total: number): BatchState {
  switch (action.type) {
    case 'vote':
      return state.phase === 'viewing'
        ? { ...state, phase: 'reasons', pendingValue: action.value, voted: state.voted + 1 }
        : state;
    case 'reasonsDone':
      return state.phase === 'reasons' ? advance(state, total) : state;
    case 'skip':
      return state.phase === 'viewing' ? advance(state, total) : state;
    case 'change':
      return changed(state, action.index, action.result);
    default:
      return state;
  }
}
