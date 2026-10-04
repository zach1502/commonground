import { z } from 'zod';

// Catalog ids double as model keys and URL slugs, so they stay kebab-case.
const KEBAB_CASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const designIdSchema = z.string().min(1).brand<'DesignId'>();
export const projectIdSchema = z.string().min(1).brand<'ProjectId'>();
export const userIdSchema = z.string().min(1).brand<'UserId'>();
export const parcelIdSchema = z.string().min(1).brand<'ParcelId'>();
/** Id of one element (item, path, area or zone) inside a design document. */
export const itemIdSchema = z.string().min(1).brand<'ItemId'>();
/** Lowercase words joined by hyphens, for catalog ids and model keys. */
export const slugSchema = z.string().regex(KEBAB_CASE);
export const catalogIdSchema = slugSchema.brand<'CatalogId'>();
/** Id of one resident comment on an element of a submitted design. */
export const commentIdSchema = z.string().min(1).brand<'CommentId'>();

export type DesignId = z.infer<typeof designIdSchema>;
export type ProjectId = z.infer<typeof projectIdSchema>;
export type UserId = z.infer<typeof userIdSchema>;
export type ParcelId = z.infer<typeof parcelIdSchema>;
export type ItemId = z.infer<typeof itemIdSchema>;
export type CatalogId = z.infer<typeof catalogIdSchema>;
export type CommentId = z.infer<typeof commentIdSchema>;

/** Ids of features that are in the park today start with this, in the seed and the wizard. */
export const EXISTING_FEATURE_PREFIX = 'existing-';

/** The item id for a feature of today's park, from its source dataset and record. */
export function existingFeatureId(sourceKey: string): string {
  return `${EXISTING_FEATURE_PREFIX}${sourceKey}`;
}

/** True when the id names a feature that is in the park today. */
export function isExistingFeatureId(id: string): boolean {
  return id.startsWith(EXISTING_FEATURE_PREFIX);
}
