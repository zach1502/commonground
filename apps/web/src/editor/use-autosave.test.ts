import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import { AUTOSAVE_DELAY_MS, AUTOSAVE_RETRY_MS, createAutosave } from './autosave';
import { classifySaveFailure } from './use-autosave';

describe('classifySaveFailure', () => {
  it('reads a 401 as a signed-out session, not a generic failure', () => {
    const error = new ApiRequestError(401, 'unauthenticated', 'Sign in to do this.');
    expect(classifySaveFailure(error)).toBe('signedOut');
  });

  it('reads a lost link as paused and any other server error as failed', () => {
    expect(classifySaveFailure(new TypeError('offline'))).toBe('paused');
    expect(classifySaveFailure(new ApiRequestError(500, 'internal', 'boom'))).toBe('failed');
  });
});

describe('createAutosave when the session ends', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('keeps the draft and never retries on its own after a 401', async () => {
    const error = new ApiRequestError(401, 'unauthenticated', 'Sign in to do this.');
    const save = vi.fn().mockRejectedValue(error);
    const statuses: string[] = [];
    const autosave = createAutosave({
      save,
      onStatus: (status) => statuses.push(status),
      classify: classifySaveFailure,
    });
    autosave.schedule('mine');
    await vi.advanceTimersByTimeAsync(AUTOSAVE_DELAY_MS + AUTOSAVE_RETRY_MS * 3);
    expect(save).toHaveBeenCalledOnce();
    expect(statuses.at(-1)).toBe('signedOut');
  });
});
