// Kept apart from the zod schema in self-report.ts, so the web shell can list the age bands
// without loading zod.
export const AGE_BANDS = ['under-18', '18-29', '30-44', '45-64', '65-plus', 'prefer-not'] as const;
export type AgeBand = (typeof AGE_BANDS)[number];

/** A forward sortation area: the first 3 characters of a Canadian postal code. */
export const FSA_PATTERN = /^[ABCEGHJ-NPRSTVXY]\d[A-Z]$/i;
