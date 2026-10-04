import { describe, expect, it } from 'vitest';

import { retryDelayMs } from './retry-delay.js';

/** Gemini's OpenAI-compatible endpoint wraps the Google error object in a JSON array. */
function geminiBody(retryDelay: string): string {
  return JSON.stringify([
    {
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay },
        ],
      },
    },
  ]);
}

describe('retryDelayMs', () => {
  it('reads Retry-After in seconds first', () => {
    expect(retryDelayMs('12', geminiBody('31s'))).toBe(12_000);
  });

  it('reads retryDelay from a Gemini body wrapped in an array', () => {
    expect(retryDelayMs(null, geminiBody('31s'))).toBe(31_000);
    expect(retryDelayMs(null, geminiBody('2.5s'))).toBe(2500);
  });

  it('reads retryDelay from a bare error object', () => {
    const body = JSON.stringify({ error: { details: [{ retryDelay: '7s' }] } });
    expect(retryDelayMs(null, body)).toBe(7000);
  });

  it('skips a Retry-After it cannot read and uses the body', () => {
    expect(retryDelayMs('Wed, 21 Oct 2026 07:28:00 GMT', geminiBody('31s'))).toBe(31_000);
  });

  it('gives undefined when neither the header nor the body has a delay', () => {
    expect(retryDelayMs(null, 'slow down')).toBeUndefined();
    expect(retryDelayMs(null, JSON.stringify({ error: { details: [] } }))).toBeUndefined();
    expect(retryDelayMs(null, geminiBody('soon'))).toBeUndefined();
  });
});
