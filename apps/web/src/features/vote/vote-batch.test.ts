import { describe, expect, it } from 'vitest';

import { batchReducer, initialBatchState, type BatchAction, type BatchState } from './vote-batch';

const TOTAL = 3;
const step = (state: BatchState, action: Parameters<typeof batchReducer>[1]) =>
  batchReducer(state, action, TOTAL);

describe('batchReducer', () => {
  it('opens the reason window on a vote and counts it', () => {
    const after = step(initialBatchState(), { type: 'vote', value: 1 });
    expect(after).toMatchObject({ phase: 'reasons', pendingValue: 1, voted: 1, index: 0 });
  });

  it('advances to the next design when the reason window closes', () => {
    let state = step(initialBatchState(), { type: 'vote', value: -1 });
    state = step(state, { type: 'reasonsDone' });
    expect(state).toMatchObject({ phase: 'viewing', index: 1, voted: 1, pendingValue: null });
  });

  it('skips without counting a vote', () => {
    const after = step(initialBatchState(), { type: 'skip' });
    expect(after).toMatchObject({ phase: 'viewing', index: 1, voted: 0 });
  });

  it('ends the batch after the last design', () => {
    let state = initialBatchState();
    for (let n = 0; n < TOTAL; n += 1) {
      state = step(state, { type: 'vote', value: 1 });
      state = step(state, { type: 'reasonsDone' });
    }
    expect(state).toMatchObject({ phase: 'done', index: TOTAL, voted: TOTAL });
  });

  it('ignores a reasonsDone while still viewing', () => {
    const state = initialBatchState();
    expect(step(state, { type: 'reasonsDone' })).toEqual(state);
  });

  it('ignores a second vote or a skip while the reason window is open', () => {
    const open = step(initialBatchState(), { type: 'vote', value: 1 });
    expect(step(open, { type: 'vote', value: -1 })).toEqual(open);
    expect(step(open, { type: 'skip' })).toEqual(open);
  });

  it('ignores an action it does not know', () => {
    const state = initialBatchState();
    expect(step(state, { type: 'undo' } as unknown as BatchAction)).toEqual(state);
  });

  it('records each design with up, down or skipped, in batch order', () => {
    let state = step(initialBatchState(), { type: 'vote', value: 1 });
    state = step(state, { type: 'reasonsDone' });
    state = step(state, { type: 'skip' });
    state = step(state, { type: 'vote', value: -1 });
    state = step(state, { type: 'reasonsDone' });
    expect(state.results).toEqual(['up', 'skipped', 'down']);
  });

  it('records no result until the reason window closes', () => {
    const open = step(initialBatchState(), { type: 'vote', value: 1 });
    expect(open.results).toEqual([]);
  });
});

describe('batchReducer changes after the end', () => {
  it('changes one result after the batch ends and keeps the voted count equal to the votes', () => {
    let state = initialBatchState();
    for (let n = 0; n < TOTAL; n += 1) {
      state = step(state, { type: 'vote', value: 1 });
      state = step(state, { type: 'reasonsDone' });
    }
    state = step(state, { type: 'change', index: 1, result: 'down' });
    expect(state).toMatchObject({ phase: 'done', results: ['up', 'down', 'up'], voted: 3 });
    state = step(state, { type: 'change', index: 0, result: 'skipped' });
    expect(state).toMatchObject({ results: ['skipped', 'down', 'up'], voted: 2 });
    state = step(state, { type: 'change', index: 0, result: 'up' });
    expect(state).toMatchObject({ results: ['up', 'down', 'up'], voted: 3 });
  });

  it('ignores a change before the batch ends or for a design it never passed', () => {
    const open = step(initialBatchState(), { type: 'vote', value: 1 });
    expect(step(open, { type: 'change', index: 0, result: 'down' })).toEqual(open);
    let done = initialBatchState();
    for (let n = 0; n < TOTAL; n += 1) done = step(done, { type: 'skip' });
    expect(step(done, { type: 'change', index: TOTAL, result: 'up' })).toEqual(done);
  });
});
