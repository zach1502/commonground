import { AGE_BANDS, type AgeBand } from '@parkshape/core';

/** The first 3 characters of a postal code (forward sortation area) and an age band. */
export interface SelfReport {
  readonly fsa: string | null;
  readonly ageBand: AgeBand | null;
}

export type SelfReportEntry =
  { readonly kind: 'answered'; readonly report: SelfReport } | { readonly kind: 'skipped' };

// Canada Post never uses D, F, I, O, Q, U as the first or third letter, or W, Z first.
const FSA_PATTERN = /^[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z]$/;

export type FsaResult =
  { readonly kind: 'ok'; readonly value: string | null } | { readonly kind: 'invalid-fsa' };

/** Parses a typed FSA; an empty answer is allowed and means no answer. */
export function parseFsa(input: string): FsaResult {
  const value = input.trim().toUpperCase();
  if (value === '') {
    return { kind: 'ok', value: null };
  }
  return FSA_PATTERN.test(value) ? { kind: 'ok', value } : { kind: 'invalid-fsa' };
}

function isAgeBand(value: string | null): value is AgeBand {
  return AGE_BANDS.some((band) => band === value);
}

export type SelfReportResult =
  { readonly kind: 'ok'; readonly report: SelfReport } | { readonly kind: 'invalid-fsa' };

/** Checks the raw form answers and returns the report to keep. */
export function validateSelfReport(input: {
  readonly fsa: string;
  readonly ageBand: string | null;
}): SelfReportResult {
  const fsa = parseFsa(input.fsa);
  if (fsa.kind === 'invalid-fsa') {
    return fsa;
  }
  return {
    kind: 'ok',
    report: { fsa: fsa.value, ageBand: isAgeBand(input.ageBand) ? input.ageBand : null },
  };
}

/** Remembers, per user, that the self-report was answered or skipped. */
export interface SelfReportStore {
  has(userId: string): boolean;
  save(userId: string, entry: SelfReportEntry): void;
}

export function createMemorySelfReportStore(): SelfReportStore {
  const entries = new Map<string, SelfReportEntry>();
  return {
    has: (userId) => entries.has(userId),
    save: (userId, entry) => {
      entries.set(userId, entry);
    },
  };
}

const STORAGE_PREFIX = 'parkshape.self-report.';

/** Remembers in Web Storage that the page was answered or skipped; answers go to the API. */
export function createBrowserSelfReportStore(storage: Storage): SelfReportStore {
  return {
    has: (userId) => storage.getItem(`${STORAGE_PREFIX}${userId}`) !== null,
    save: (userId, entry) => {
      storage.setItem(`${STORAGE_PREFIX}${userId}`, JSON.stringify(entry));
    },
  };
}
