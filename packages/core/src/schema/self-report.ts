import { z } from 'zod';

import { AGE_BANDS, FSA_PATTERN } from './age-bands.js';

export { AGE_BANDS, FSA_PATTERN } from './age-bands.js';
export type { AgeBand } from './age-bands.js';

/** The optional answers a resident gives once: an FSA and an age band, each may be null. */
export const selfReportSchema = z.strictObject({
  fsa: z
    .string()
    .regex(FSA_PATTERN)
    .transform((fsa) => fsa.toUpperCase())
    .nullable(),
  ageBand: z.enum(AGE_BANDS).nullable(),
});

export type SelfReport = z.output<typeof selfReportSchema>;
