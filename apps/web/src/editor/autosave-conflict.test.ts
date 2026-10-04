import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTOSAVE_DELAY_MS, AUTOSAVE_RETRY_MS, createAutosave } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function deferred() {
  let resolve: () => void = () => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const conflictOnce = () =>
  vi.fn().mockRejectedValueOnce(new Error('409')).mockResolvedValue(undefined);

describe('createAutosave runs one save at a time', () => {
  it('holds a change made during a save until that save answers, then sends the newest', async () => {
    const first = deferred();
    const save = vi.fn().mockReturnValueOnce(first.promise).mockResolvedValue(undefined);
    const autosave = createAutosave({ save, onStatus: vi.fn() });
    autosave.schedule('a');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    autosave.schedule('b');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
    first.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith('b');
  });

  it('answers flush with the status the save ended in', async () => {
    const autosave = createAutosave({
      save: conflictOnce(),
      onStatus: vi.fn(),
      classify: () => 'conflict',
    });
    autosave.schedule('mine');
    await expect(autosave.flush()).resolves.toBe('conflict');
  });
});

describe('createAutosave after a conflict', () => {
  it('waits for the reader: no retry on its own, on the next change or when back online', async () => {
    const save = conflictOnce();
    const statuses: string[] = [];
    const autosave = createAutosave({
      save,
      onStatus: (status) => statuses.push(status),
      classify: () => 'conflict',
    });
    autosave.schedule('mine');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    autosave.schedule('mine, edited');
    await autosave.retry();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + AUTOSAVE_RETRY_MS * 3);
    expect(save).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toBe('conflict');
  });

  it('sends the newest change when the reader keeps it', async () => {
    const save = conflictOnce();
    const autosave = createAutosave({ save, onStatus: vi.fn(), classify: () => 'conflict' });
    autosave.schedule('mine');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    autosave.schedule('mine, edited');
    await expect(autosave.resolve('keep')).resolves.toBe('saved');
    expect(save).toHaveBeenLastCalledWith('mine, edited');
  });

  it('drops the local change when the reader takes the saved version', async () => {
    const save = conflictOnce();
    const statuses: string[] = [];
    const autosave = createAutosave({
      save,
      onStatus: (status) => statuses.push(status),
      classify: () => 'conflict',
    });
    autosave.schedule('mine');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    await expect(autosave.resolve('discard')).resolves.toBe('saved');
    await autosave.retry();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS);
    expect(save).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toBe('saved');
  });
});
