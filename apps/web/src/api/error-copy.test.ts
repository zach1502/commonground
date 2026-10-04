import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import { messages } from '../messages';

import { failureCopyFor } from './error-copy';

function apiError(status: number, kind: string, body?: unknown): ApiRequestError {
  return new ApiRequestError(status, kind, 'server message', body);
}

function rateLimited(seconds: number): ApiRequestError {
  return apiError(429, 'rate-limited', {
    error: { kind: 'rate-limited', message: 'Slow down.', retryAfterSeconds: seconds },
  });
}

describe('failureCopyFor', () => {
  it('maps a 401 to the signed-out fact and a sign-in action', () => {
    const copy = failureCopyFor(apiError(401, 'unauthenticated'), 'save');
    expect(copy.message).toBe(messages.failure.signedOut);
    expect(copy.action).toBe('signIn');
    expect(copy.waitSeconds).toBeNull();
  });

  it('maps a 409 wrong-status on submit to the changed-during-submit fact and retry', () => {
    const copy = failureCopyFor(apiError(409, 'wrong-status'), 'submit');
    expect(copy.message).toBe(messages.failure.changedDuringSubmit);
    expect(copy.action).toBe('retry');
  });

  it('maps a 409 draftChanged to the saved-elsewhere fact and pick-version', () => {
    const copy = failureCopyFor(apiError(409, 'draftChanged'), 'save');
    expect(copy.message).toBe(messages.failure.savedElsewhere);
    expect(copy.action).toBe('pickVersion');
  });

  it('maps a 413 to the design-too-large fact and a reduce-items action', () => {
    const copy = failureCopyFor(apiError(413, 'payload-too-large'), 'submit');
    expect(copy.message).toBe(messages.failure.designTooLarge);
    expect(copy.action).toBe('reduceItems');
  });

  it('maps a 429 on vote to the too-many-votes fact with the Retry-After seconds', () => {
    const copy = failureCopyFor(rateLimited(30), 'vote');
    expect(copy.message).toBe('You voted too many times just now. Try again in 30 seconds.');
    expect(copy.action).toBe('wait');
    expect(copy.waitSeconds).toBe(30);
  });

  it('maps a 429 on login to the too-many-sign-in fact with the Retry-After seconds', () => {
    const copy = failureCopyFor(rateLimited(45), 'login');
    expect(copy.message).toBe('Too many sign-in tries. Try again in 45 seconds.');
    expect(copy.action).toBe('wait');
    expect(copy.waitSeconds).toBe(45);
  });

  it('maps a 500 to the server-error fact and retry', () => {
    const copy = failureCopyFor(apiError(500, 'internal'), 'submit');
    expect(copy.message).toBe(messages.failure.serverError);
    expect(copy.action).toBe('retry');
  });

  it('maps a phase-closed on start to the project-closed fact', () => {
    const copy = failureCopyFor(apiError(409, 'phase-closed'), 'start');
    expect(copy.message).toBe(messages.failure.projectClosed);
    expect(copy.action).toBe('goVote');
  });

  it('falls back to the server-error fact for an unknown failure', () => {
    const copy = failureCopyFor(new Error('boom'), 'save');
    expect(copy.message).toBe(messages.failure.serverError);
    expect(copy.action).toBe('retry');
  });
});
