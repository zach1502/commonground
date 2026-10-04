import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import { messages } from '../../messages';

import { commentFailure } from './comment-failure';

const project = { closesAt: '2026-10-31', text: 'Face the swings' };

function refusal(status: number, kind: string, body?: unknown) {
  return new ApiRequestError(status, kind, 'refused', body);
}

describe('commentFailure', () => {
  it('names the closing day when the project closed as the comment went', () => {
    expect(commentFailure(refusal(409, 'phase-closed'), project)).toBe(
      'Commenting closed on 31 October 2026. Your comment was not sent.',
    );
  });

  it('asks for a shorter comment when the server finds it too long', () => {
    const long = { ...project, text: 'a'.repeat(281) };
    expect(commentFailure(refusal(400, 'validation'), long)).toBe(
      'Comment is over 280 characters. Shorten it to send.',
    );
  });

  it('asks for plain text when the server refuses a comment of the right length', () => {
    expect(commentFailure(refusal(400, 'validation'), project)).toBe(
      'Comments take plain text only. Remove the tags to send.',
    );
  });

  it('gives the wait in seconds for a rate limit', () => {
    const body = { error: { retryAfterSeconds: 30 } };
    expect(commentFailure(refusal(429, 'rate-limited', body), project)).toBe(
      'You sent too many comments just now. Try again in 30 seconds.',
    );
  });

  it('uses the signed out line from the error table', () => {
    expect(commentFailure(refusal(401, 'unauthenticated'), project)).toBe(
      messages.failure.signedOut,
    );
  });

  it('reads anything else as a server error', () => {
    expect(commentFailure(new Error('offline'), project)).toBe(messages.failure.serverError);
  });

  it('says commenting is closed when the project has no closing day', () => {
    expect(commentFailure(refusal(409, 'phase-closed'), { ...project, closesAt: null })).toBe(
      'Commenting is closed. Your comment was not sent.',
    );
  });
});
