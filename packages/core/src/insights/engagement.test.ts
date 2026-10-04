import { describe, expect, it } from 'vitest';

import type { AgeBand } from '../schema/self-report.js';

import { engagementBreakdown, suppressSmall } from './engagement.js';
import type { Participant } from './types.js';

function people(count: number, fsa: string | null, ageBand: AgeBand | null): Participant[] {
  return Array.from({ length: count }, (_, index) => ({
    userId: `${fsa ?? 'none'}-${ageBand ?? 'none'}-${String(index)}`,
    selfReport: { fsa, ageBand },
  }));
}

const participants = [
  ...people(6, 'V5T', '30-44'),
  ...people(5, 'V5V', '18-29'),
  ...people(2, 'V6A', '30-44'),
  { userId: 'silent', selfReport: null },
];

describe('suppressSmall', () => {
  it('replaces counts under 5 with null and flags them', () => {
    expect(suppressSmall(4)).toEqual({ count: null, suppressed: true });
    expect(suppressSmall(0)).toEqual({ count: null, suppressed: true });
    expect(suppressSmall(5)).toEqual({ count: 5, suppressed: false });
  });
});

describe('engagementBreakdown', () => {
  // Built inside each test, so a bug that throws fails that test instead of the whole file.
  const breakdown = () => engagementBreakdown(participants);

  it('groups by FSA, sorted, with people who gave none last', () => {
    expect(breakdown().byFsa).toEqual([
      { group: 'V5T', count: 6, suppressed: false },
      { group: 'V5V', count: 5, suppressed: false },
      { group: 'V6A', count: null, suppressed: true },
      { group: null, count: null, suppressed: true },
    ]);
  });

  it('lists every age band in order, suppressing small and empty bands', () => {
    expect(breakdown().byAgeBand.map((cell) => [cell.group, cell.count])).toEqual([
      ['under-18', null],
      ['18-29', 5],
      ['30-44', 8],
      ['45-64', null],
      ['65-plus', null],
      ['prefer-not', null],
      [null, null],
    ]);
  });

  it('counts each person once even when they appear twice', () => {
    const twice = engagementBreakdown([...people(5, 'V5T', null), ...people(5, 'V5T', null)]);
    expect(twice.byFsa[0]).toEqual({ group: 'V5T', count: 5, suppressed: false });
  });
});

describe('engagementBreakdown order', () => {
  it('sorts postal areas even when the first person seen is in a later one', () => {
    const late = [...people(5, 'V6A', null), ...people(5, 'V5T', null)];
    const groups = engagementBreakdown(late).byFsa.map((cell) => cell.group);
    expect(groups).toEqual(['V5T', 'V6A', null]);
  });
});
