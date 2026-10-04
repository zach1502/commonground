import { z } from 'zod';

import {
  DEFAULT_MAX_CROSS_SLOPE,
  DEFAULT_MAX_RUNNING_SLOPE,
  DEFAULT_SCORE_PRIOR,
  DEFAULT_TERRAFORM_LIMIT_M,
  ROOT_ZONE_RADIUS_PER_DBH_CM,
} from '../constants.js';

import { categorySchema, severitySchema } from './catalog.js';
import { zoneSchema } from './design.js';
import { catalogIdSchema } from './ids.js';
import {
  cadSchema,
  cubicMetresSchema,
  percentSchema,
  positiveMetresSchema,
  slopeSchema,
} from './units.js';

// Jonathan Rogers demo values. See packages/core/costs-sources.md for the earthworks rates.
const DEMO_BUDGET_CAD = 1_500_000;
const DEMO_CUT_PER_M3_CAD = 25;
const DEMO_FILL_PER_M3_CAD = 35;
const DEMO_HAUL_PER_M3_CAD = 20;
const DEMO_MIN_CANOPY_PERCENT = 30;
const DEMO_MAX_IMPERVIOUS_PERCENT = 35;
const DEMO_MIN_GARDEN_PLOTS = 20;
const DEMO_BRIEF =
  'Jonathan Rogers Park needs more shade and a bigger community garden. Keep the large trees, the washroom and the ball diamond.';

export const CONSTRAINT_KEYS = [
  'budget',
  'canopy',
  'impervious',
  'requiredFeatures',
  'forbiddenZones',
  'slopes',
  'counts',
  'terraform',
  'treeProtection',
] as const;
export const constraintKeySchema = z.enum(CONSTRAINT_KEYS);
export type ConstraintKey = z.infer<typeof constraintKeySchema>;

const featureCountFields = {
  minCount: z.int().positive(),
  minPlots: z.int().positive().optional(),
};

export const requiredFeatureSchema = z.union([
  z.strictObject({ category: categorySchema, ...featureCountFields }),
  z.strictObject({ catalogId: catalogIdSchema, ...featureCountFields }),
]);

export const countRangeSchema = z
  .strictObject({
    category: categorySchema,
    min: z.int().nonnegative().optional(),
    max: z.int().nonnegative().optional(),
  })
  .refine((range) => range.min === undefined || range.max === undefined || range.min <= range.max, {
    message: 'min is above max',
  });

export const projectParametersSchema = z.strictObject({
  budget: z.strictObject({
    totalCad: cadSchema,
    earthworks: z.strictObject({ cutPerM3: cadSchema, fillPerM3: cadSchema, haulPerM3: cadSchema }),
  }),
  canopy: z.strictObject({ minPercent: percentSchema }),
  impervious: z.strictObject({ maxPercent: percentSchema }),
  requiredFeatures: z.array(requiredFeatureSchema),
  forbiddenZones: z.array(zoneSchema),
  slopes: z
    .strictObject({
      maxRunning: slopeSchema.prefault(DEFAULT_MAX_RUNNING_SLOPE),
      maxCross: slopeSchema.prefault(DEFAULT_MAX_CROSS_SLOPE),
    })
    .prefault({}),
  counts: z.array(countRangeSchema),
  terraform: z
    .strictObject({
      maxDeviationM: positiveMetresSchema.prefault(DEFAULT_TERRAFORM_LIMIT_M),
      maxNetHaulM3: cubicMetresSchema.optional(),
      maxDisturbedPercent: percentSchema.optional(),
    })
    .prefault({}),
  treeProtection: z
    .strictObject({ rootZonePerDbhCm: positiveMetresSchema.prefault(ROOT_ZONE_RADIUS_PER_DBH_CM) })
    .prefault({}),
  brief: z.string(),
  scoringPrior: z
    .strictObject({ up: z.number().positive(), down: z.number().positive() })
    .prefault(DEFAULT_SCORE_PRIOR),
  severity: z.record(constraintKeySchema, severitySchema),
});

export type RequiredFeature = z.infer<typeof requiredFeatureSchema>;
export type CountRange = z.infer<typeof countRangeSchema>;
export type ProjectParameters = z.infer<typeof projectParametersSchema>;
export type ProjectParametersInput = z.input<typeof projectParametersSchema>;

/** Parameters for the Jonathan Rogers Park demo. Each call returns a new object. */
export function defaultParameters(): ProjectParameters {
  return projectParametersSchema.parse({
    budget: {
      totalCad: DEMO_BUDGET_CAD,
      earthworks: {
        cutPerM3: DEMO_CUT_PER_M3_CAD,
        fillPerM3: DEMO_FILL_PER_M3_CAD,
        haulPerM3: DEMO_HAUL_PER_M3_CAD,
      },
    },
    canopy: { minPercent: DEMO_MIN_CANOPY_PERCENT },
    impervious: { maxPercent: DEMO_MAX_IMPERVIOUS_PERCENT },
    requiredFeatures: [{ category: 'garden', minCount: 1, minPlots: DEMO_MIN_GARDEN_PLOTS }],
    forbiddenZones: [],
    counts: [],
    brief: DEMO_BRIEF,
    severity: {
      budget: 'soft',
      canopy: 'soft',
      impervious: 'soft',
      requiredFeatures: 'hard',
      forbiddenZones: 'hard',
      slopes: 'soft',
      counts: 'soft',
      terraform: 'soft',
      treeProtection: 'soft',
    },
  });
}
