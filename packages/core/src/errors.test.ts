import { describe, expect, it } from 'vitest';

import { constraintViolation, invalidDocument } from './errors.js';

describe('typed errors', () => {
  it('builds an invalid document error from its issues', () => {
    const issue = { kind: 'elevationCount', expected: 4, actual: 3 } as const;
    expect(invalidDocument([issue])).toEqual({ kind: 'invalidDocument', issues: [issue] });
  });

  it('builds a constraint violation from the failed keys', () => {
    expect(constraintViolation(['budget'])).toEqual({
      kind: 'constraintViolation',
      failed: ['budget'],
    });
  });
});
