import { describe, expect, it } from 'vitest';

import { arrivalFrom, SUBMITTED_ARRIVAL } from './arrival';

describe('arrivalFrom', () => {
  it('reads the submitted arrival the editor sends with its navigation', () => {
    expect(arrivalFrom(SUBMITTED_ARRIVAL)).toBe('submitted');
  });

  it('treats any other history state as a plain visit', () => {
    expect(arrivalFrom(null)).toBe('visit');
    expect(arrivalFrom({ arrival: 'elsewhere' })).toBe('visit');
    expect(arrivalFrom('submitted')).toBe('visit');
  });
});
