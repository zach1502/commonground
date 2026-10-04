import { z } from 'zod';

import { catalogItems } from '../catalog/catalog.js';
import { categorySchema, pathSurfaceSchema } from '../schema/catalog.js';

/** The eight compass zones of the parcel and its centre, a 3 by 3 grid. North is the street side. */
export const COMPASS_ZONES = [
  'north',
  'north-east',
  'east',
  'south-east',
  'south',
  'south-west',
  'west',
  'north-west',
  'centre',
] as const;

export const MAX_FEATURE_COUNT = 50;
export const MAX_FEATURES = 20;
export const MAX_PLACE_NAME_CHARS = 60;
/** Longest description the API accepts; longer text gets a 400 before any provider runs. */
export const MAX_DESCRIPTION_CHARS = 400;

const CATALOG_IDS: readonly string[] = catalogItems.map((item) => item.id);
export const intentCatalogIdSchema = z.enum(CATALOG_IDS);

const placeNameSchema = z.string().min(1).max(MAX_PLACE_NAME_CHARS);

export const compassZoneSchema = z.enum(COMPASS_ZONES);
export const terrainPreferenceSchema = z.enum(['flat', 'low', 'high', 'edge']);
export const featureSizeSchema = z.enum(['small', 'medium', 'large']);
export const pathStyleSchema = z.enum(['loop', 'connect-all', 'minimal']);
export const canopyPreferenceSchema = z.enum(['keep-existing', 'add-some', 'maximize']);
export const characterSchema = z.enum(['open-lawn', 'natural', 'active']);

export const intentPlacementSchema = z.strictObject({
  zone: compassZoneSchema.optional(),
  near: placeNameSchema.optional(),
  awayFrom: placeNameSchema.optional(),
  terrain: terrainPreferenceSchema.optional(),
});

export const intentFeatureSchema = z
  .strictObject({
    catalogId: intentCatalogIdSchema.optional(),
    category: categorySchema.optional(),
    /**
     * How many to have. For an area the park already has, the existing ones count toward it.
     * 0 asks for none, so an unlocked existing feature of that kind is removed.
     */
    count: z.int().min(0).max(MAX_FEATURE_COUNT),
    size: featureSizeSchema.optional(),
    placement: intentPlacementSchema.optional(),
  })
  .refine((feature) => feature.catalogId !== undefined || feature.category !== undefined, {
    message: 'Name a catalog id or a category',
  });

/** What a resident asked for, read from their description. Shared by packages/ai and the solver. */
export const intentSchema = z.strictObject({
  features: z.array(intentFeatureSchema).max(MAX_FEATURES),
  paths: z.strictObject({ style: pathStyleSchema, surface: pathSurfaceSchema.optional() }),
  canopy: canopyPreferenceSchema,
  character: characterSchema,
});

export type CompassZone = z.infer<typeof compassZoneSchema>;
export type TerrainPreference = z.infer<typeof terrainPreferenceSchema>;
export type FeatureSize = z.infer<typeof featureSizeSchema>;
export type PathStyle = z.infer<typeof pathStyleSchema>;
export type CanopyPreference = z.infer<typeof canopyPreferenceSchema>;
export type Character = z.infer<typeof characterSchema>;
export type IntentPlacement = z.infer<typeof intentPlacementSchema>;
export type IntentFeature = z.infer<typeof intentFeatureSchema>;
export type Intent = z.infer<typeof intentSchema>;
