import { z } from 'zod';

import { localPointSchema, polygonSchema, polylineSchema } from '../schema/geometry.js';
import { positiveMetresSchema } from '../schema/units.js';

/** The context layers around a parcel, in the order they are listed and drawn. */
export const CONTEXT_FEATURE_KINDS = [
  'street',
  'sidewalk',
  'busStop',
  'parking',
  'bikeway',
] as const;

export const contextFeatureKindSchema = z.enum(CONTEXT_FEATURE_KINDS);

export type ContextFeatureKind = z.infer<typeof contextFeatureKindSchema>;

/** A centreline drawn as a flat ribbon of `widthM`, such as a street, sidewalk or bikeway. */
const lineGeometrySchema = z.strictObject({
  type: z.literal('line'),
  points: polylineSchema,
  widthM: positiveMetresSchema,
});

/** A closed ring, such as one parking stall; the last point joins the first. */
const polygonGeometrySchema = z.strictObject({
  type: z.literal('polygon'),
  ring: polygonSchema,
});

/** One position, such as a bus stop pin. */
const pointGeometrySchema = z.strictObject({
  type: z.literal('point'),
  position: localPointSchema,
});

/**
 * Geometry in the parcel's local frame, in metres east and north of the parcel box minimum.
 * Context reaches past the parcel, so coordinates may be negative.
 */
export const contextGeometrySchema = z.discriminatedUnion('type', [
  lineGeometrySchema,
  polygonGeometrySchema,
  pointGeometrySchema,
]);

/** Where a feature came from: a source named in terrain's sources.json and its dataset. */
export const contextSourceSchema = z.strictObject({
  name: z.string().min(1),
  datasetId: z.string().min(1),
});

/** One street, sidewalk, bus stop, parking stall or bikeway near the parcel. */
export const contextFeatureSchema = z.strictObject({
  id: z.string().min(1),
  kind: contextFeatureKindSchema,
  /** Such as "W 7th Ave" or "Westbound W Broadway @ Columbia St". */
  name: z.string().min(1).optional(),
  source: contextSourceSchema,
  geometry: contextGeometrySchema,
});

/** Every context feature within `bufferM` of the parcel box, and when the data was recorded. */
export const siteContextSchema = z.strictObject({
  features: z.array(contextFeatureSchema),
  bufferM: z.number().nonnegative(),
  recordedAt: z.iso.datetime(),
});

export type ContextGeometry = z.infer<typeof contextGeometrySchema>;
export type ContextSource = z.infer<typeof contextSourceSchema>;
export type ContextFeature = z.infer<typeof contextFeatureSchema>;
export type SiteContext = z.infer<typeof siteContextSchema>;

const KIND_ORDER = new Map<string, number>(
  CONTEXT_FEATURE_KINDS.map((kind, index) => [kind, index]),
);

/** Layer order first, then id, so every provider lists the same features the same way. */
export function compareContextFeatures(left: ContextFeature, right: ContextFeature): number {
  const byKind = (KIND_ORDER.get(left.kind) ?? 0) - (KIND_ORDER.get(right.kind) ?? 0);
  if (byKind !== 0) return byKind;
  if (left.id === right.id) return 0;
  return left.id < right.id ? -1 : 1;
}
