import { z } from 'zod';

import { intentSchema } from '../solver/intent.js';

import { pathSurfaceSchema } from './catalog.js';
import { localPointSchema, polygonSchema, polylineSchema } from './geometry.js';
import { catalogIdSchema, itemIdSchema } from './ids.js';
import { metresSchema, positiveMetresSchema } from './units.js';

const FULL_TURN_DEG = 360;
// Trees vary in size within 10 percent (DESIGN.md, placing items).
const SCALE_JITTER_MIN = 0.9;
const SCALE_JITTER_MAX = 1.1;
// Seeds are unsigned 32-bit, as the seeded Random takes them.
const MAX_SEED = 0xffff_ffff;

export const designItemSchema = z.strictObject({
  id: itemIdSchema,
  catalogId: catalogIdSchema,
  position: localPointSchema,
  rotationDeg: z.number().min(0).lt(FULL_TURN_DEG),
  locked: z.boolean(),
  scaleJitter: z.number().min(SCALE_JITTER_MIN).max(SCALE_JITTER_MAX).optional(),
  /** Measured trunk diameter for existing trees. Metrics fall back to the catalog value. */
  dbhCm: z.number().positive().optional(),
});

export const designPathSchema = z.strictObject({
  id: itemIdSchema,
  surface: pathSurfaceSchema,
  widthM: positiveMetresSchema,
  points: polylineSchema,
  /** Part of the park as it is today, so the slope limits do not apply. Dropped on any edit. */
  existing: z.boolean().optional(),
});

export const designAreaSchema = z.strictObject({
  id: itemIdSchema,
  catalogId: catalogIdSchema,
  polygon: polygonSchema,
  locked: z.boolean(),
  /** Part of the park as it is today, so the ground-grade limit does not apply. Dropped on any edit. */
  existing: z.boolean().optional(),
  /**
   * Plots the site record lists for an existing garden. Metrics read it from the baseline area
   * with the same id, and only while the polygon is unchanged; otherwise beds are fitted.
   */
  recordedPlots: z.int().positive().optional(),
});

/** One terrain grid cell raised (positive) or lowered (negative) from existing grade. */
export const gradeCellSchema = z.strictObject({
  x: z.int().nonnegative(),
  y: z.int().nonnegative(),
  deltaM: metresSchema,
});

export const zoneKindSchema = z.enum(['forbidden', 'noGrade']);

export const zoneSchema = z.strictObject({
  id: itemIdSchema,
  kind: zoneKindSchema,
  polygon: polygonSchema,
  label: z.string().min(1),
});

/** Where a Describe it draft came from, so the same arrangement can be made again. */
export const generatedSchema = z.strictObject({
  intent: intentSchema,
  seed: z.int().min(0).max(MAX_SEED),
  notes: z.array(z.string()),
  // Who read the description. Optional because drafts made before this field have neither.
  source: z.enum(['rule-based', 'model']).optional(),
  /** The language model's name; set only when source is model. */
  model: z.string().min(1).optional(),
});

export const designDocumentSchema = z.strictObject({
  version: z.literal(1),
  items: z.array(designItemSchema),
  paths: z.array(designPathSchema),
  areas: z.array(designAreaSchema),
  // Sparse: cells left out keep their existing grade.
  gradeDelta: z.strictObject({ cells: z.array(gradeCellSchema) }),
  zones: z.array(zoneSchema),
  generated: generatedSchema.optional(),
});

export type DesignItem = z.infer<typeof designItemSchema>;
export type DesignPath = z.infer<typeof designPathSchema>;
export type DesignArea = z.infer<typeof designAreaSchema>;
export type GradeCell = z.infer<typeof gradeCellSchema>;
export type ZoneKind = z.infer<typeof zoneKindSchema>;
export type Zone = z.infer<typeof zoneSchema>;
export type Generated = z.infer<typeof generatedSchema>;
export type DesignDocument = z.infer<typeof designDocumentSchema>;
export type DesignDocumentInput = z.input<typeof designDocumentSchema>;
