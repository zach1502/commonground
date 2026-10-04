import { CONSTRAINT_KEYS, type ConstraintKey } from '../schema/parameters.js';

import type { InsightDesign } from './types.js';

export interface ComplianceCounts {
  readonly key: ConstraintKey;
  readonly ok: number;
  readonly warn: number;
  readonly fail: number;
}

/** How many designs met, missed (soft) or failed (hard) each constraint when submitted. */
export function complianceDistribution(designs: readonly InsightDesign[]): ComplianceCounts[] {
  const statuses = designs.flatMap((design) => (design.metrics === null ? [] : [design.metrics]));
  return CONSTRAINT_KEYS.map((key) => {
    const of = (status: 'ok' | 'warn' | 'fail') =>
      statuses.filter((metrics) => metrics.constraints[key] === status).length;
    return { key, ok: of('ok'), warn: of('warn'), fail: of('fail') };
  });
}
