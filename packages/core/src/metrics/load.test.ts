import { describe, expect, it } from 'vitest';

// format.ts builds its number formatters when it loads. A static import would turn a load
// failure into a failed file with no tests, which Stryker counts as a surviving mutant, so the
// test imports the module itself.

describe('metrics modules at load', () => {
  it('builds the en-CA percent and dollar formatters', async () => {
    const { formatCad, formatPercent } = await import('./format.js');
    expect(formatCad(1234567)).toBe('$1,234,567');
    expect(formatPercent(0.351)).toBe('35.1%');
  });
});
