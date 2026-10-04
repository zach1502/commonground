import type { z } from '@hono/zod-openapi';

import type { DesignSummary } from '@parkshape/db';

import type { designSummarySchema } from './contracts/projects-designs.js';

type DesignSummaryBody = z.infer<typeof designSummarySchema>;

interface RankedEntry {
  readonly design: DesignSummary;
  readonly score: number;
  /** The design as every viewer sees it before authors are resolved for that viewer. */
  readonly summary: DesignSummaryBody;
}

/** One project's live designs, ranked and presented once for every viewer to share. */
export interface RankedBoard {
  readonly prior: { readonly up: number; readonly down: number };
  readonly entries: readonly RankedEntry[];
}
