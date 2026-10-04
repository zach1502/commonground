import { describe, expect, it } from 'vitest';

import { AGE_BANDS, FSA_PATTERN } from './age-bands.js';
import { selfReportSchema } from './self-report.js';

describe('self-report schema', () => {
  it('lists the fixed age bands', () => {
    expect(AGE_BANDS).toEqual(['under-18', '18-29', '30-44', '45-64', '65-plus', 'prefer-not']);
  });

  it('accepts a forward sortation area in either case and stores it upper case', () => {
    expect(FSA_PATTERN.test('v5t')).toBe(true);
    expect(selfReportSchema.parse({ fsa: 'v5t', ageBand: '30-44' })).toEqual({
      fsa: 'V5T',
      ageBand: '30-44',
    });
  });

  it('takes null for either answer', () => {
    expect(selfReportSchema.parse({ fsa: null, ageBand: null })).toEqual({
      fsa: null,
      ageBand: null,
    });
  });

  it('rejects letters Canada Post never uses first, digits in place of letters and unknown bands', () => {
    expect(selfReportSchema.safeParse({ fsa: 'D5T', ageBand: null }).success).toBe(false);
    expect(selfReportSchema.safeParse({ fsa: 'V55', ageBand: null }).success).toBe(false);
    expect(selfReportSchema.safeParse({ fsa: null, ageBand: 'teen' }).success).toBe(false);
  });
});

describe('forward sortation area bounds', () => {
  it('takes exactly 3 characters, with nothing before or after', () => {
    expect(selfReportSchema.safeParse({ fsa: 'V5T', ageBand: null }).success).toBe(true);
    expect(selfReportSchema.safeParse({ fsa: 'V5T4', ageBand: null }).success).toBe(false);
    expect(selfReportSchema.safeParse({ fsa: 'XV5T', ageBand: null }).success).toBe(false);
  });
});
