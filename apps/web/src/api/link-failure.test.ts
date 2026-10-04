import { describe, expect, it } from 'vitest';

import { ApiRequestError } from '@parkshape/api-client';

import { failureKind } from './link-failure';

describe('failureKind', () => {
  it('reads a fetch that never answered as a lost link', () => {
    expect(failureKind(new TypeError('Failed to fetch'))).toBe('link');
  });

  it('reads an error status from the API as a server failure', () => {
    expect(failureKind(new ApiRequestError(422, 'invalid', 'Bad draft'))).toBe('server');
  });
});
