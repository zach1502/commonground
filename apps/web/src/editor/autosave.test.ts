import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AUTOSAVE_DELAY_MS, AUTOSAVE_RETRY_MS, createAutosave } from './autosave';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createAutosave', () => {
  it('saves once, 500 ms after the last change', async () => {
    const save = vi.fn(() => Promise.resolve());
    const statuses: string[] = [];
    const autosave = createAutosave({ save, onStatus: (status) => statuses.push(status) });
    autosave.schedule('first');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    autosave.schedule('second');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS - 1);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('second');
    expect(statuses).toEqual(['pending', 'saving', 'saved']);
    expect(AUTOSAVE_DELAY_MS).toBe(500);
  });

  it('reports a failed save and saves again on the next change', async () => {
    const save = vi.fn().mockRejectedValueOnce(new Error('down')).mockResolvedValue(undefined);
    const statuses: string[] = [];
    const autosave = createAutosave({ save, onStatus: (status) => statuses.push(status) });
    autosave.schedule('one');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(statuses.at(-1)).toBe('failed');
    autosave.schedule('two');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('saves a pending change at once on flush, and nothing after dispose', async () => {
    const save = vi.fn(() => Promise.resolve());
    const autosave = createAutosave({ save, onStatus: vi.fn() });
    autosave.schedule('now');
    await autosave.flush();
    expect(save).toHaveBeenCalledWith('now');
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
    autosave.schedule('later');
    autosave.dispose();
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe('createAutosave with a lost link', () => {
  it('pauses when the link is down, keeps the change and sends it again on its own', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(undefined);
    const statuses: string[] = [];
    const autosave = createAutosave({
      save,
      onStatus: (status) => statuses.push(status),
      classify: () => 'paused',
    });
    autosave.schedule('kept');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    expect(statuses.at(-1)).toBe('paused');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_RETRY_MS);
    expect(save).toHaveBeenLastCalledWith('kept');
    expect(statuses.at(-1)).toBe('saved');
  });

  it('sends the newest change on retry, not the one that failed', async () => {
    const save = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('offline'))
      .mockResolvedValue(undefined);
    const autosave = createAutosave({ save, onStatus: vi.fn(), classify: () => 'paused' });
    autosave.schedule('old');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS);
    autosave.schedule('new');
    await autosave.retry();
    expect(save).toHaveBeenLastCalledWith('new');
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('does not send again by itself after the server refused the change', async () => {
    const save = vi.fn().mockRejectedValue(new Error('422'));
    const autosave = createAutosave({ save, onStatus: vi.fn(), classify: () => 'failed' });
    autosave.schedule('bad');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + AUTOSAVE_RETRY_MS * 3);
    expect(save).toHaveBeenCalledOnce();
  });
});
