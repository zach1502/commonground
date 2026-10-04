import { describe, expect, it } from 'vitest';

import { seedPeople } from './personas.js';
import { planSelfReports } from './self-reports.js';

const ANSWERING = 26;
const NEARBY_FSAS = ['V5T', 'V5V', 'V5Y', 'V6A'];

describe('planSelfReports', () => {
  const { residents } = seedPeople();
  const reports = planSelfReports(residents);

  it('gives most residents a nearby postal code start and an age band', () => {
    expect(reports).toHaveLength(ANSWERING);
    expect(reports.every(({ report }) => NEARBY_FSAS.includes(report.fsa ?? ''))).toBe(true);
    expect(reports.every(({ report }) => report.ageBand !== null)).toBe(true);
  });

  it('puts most answers in Mount Pleasant and keeps one area under 5', () => {
    const count = (fsa: string) => reports.filter(({ report }) => report.fsa === fsa).length;
    expect(count('V5T')).toBe(12);
    expect(count('V6A')).toBe(3);
  });

  it('gives the same answers on every run', () => {
    expect(planSelfReports(residents)).toEqual(reports);
  });
});
