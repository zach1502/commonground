import { createSeededRandom, type AgeBand, type SelfReport } from '@parkshape/core';

import type { SeedPersona } from './personas.js';
import { shuffled } from './votes.js';

export interface PlannedSelfReport {
  readonly userId: string;
  readonly report: SelfReport;
}

const SELF_REPORT_SEED = 604;
// Every seventh resident skips the questions, so 26 of 30 answer.
const SKIP_EVERY = 7;
// Mount Pleasant is V5T; V5V, V5Y and V6A border it. V6A stays under 5 to show suppression.
const FSA_COUNTS: readonly Share<string>[] = [
  { value: 'V5T', count: 12 },
  { value: 'V5Y', count: 6 },
  { value: 'V5V', count: 5 },
  { value: 'V6A', count: 3 },
];
const AGE_COUNTS: readonly Share<AgeBand>[] = [
  { value: '30-44', count: 9 },
  { value: '18-29', count: 7 },
  { value: '45-64', count: 6 },
  { value: '65-plus', count: 3 },
  { value: 'prefer-not', count: 1 },
];

interface Share<T> {
  readonly value: T;
  readonly count: number;
}

function expand<T>(shares: readonly Share<T>[]): T[] {
  return shares.flatMap(({ value, count }) => Array.from({ length: count }, () => value));
}

/** Postal code starts and age bands for most residents, spread the same way on every run. */
export function planSelfReports(residents: readonly SeedPersona[]): PlannedSelfReport[] {
  const answering = residents.filter((_, index) => index % SKIP_EVERY !== SKIP_EVERY - 1);
  const random = createSeededRandom(SELF_REPORT_SEED);
  const fsas = shuffled(expand(FSA_COUNTS), random);
  const ages = shuffled(expand(AGE_COUNTS), random);
  return answering.map((resident, index) => ({
    userId: resident.id,
    report: { fsa: fsas[index] ?? null, ageBand: ages[index] ?? null },
  }));
}
