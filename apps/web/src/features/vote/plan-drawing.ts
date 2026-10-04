import { designDocumentSchema, parcelSchema } from '@parkshape/core';
import { planPosterUrl, type ScenePalette } from '@parkshape/scene/plan';

/**
 * A flat plan of a design as an image URL, or null when the document or parcel does not parse.
 * It needs the zod schemas, so pages load this module only when a design has no thumbnail.
 */
export function drawPlan(document: unknown, parcel: unknown, palette: ScenePalette): string | null {
  const parsedDocument = designDocumentSchema.safeParse(document);
  const parsedParcel = parcelSchema.safeParse(parcel);
  if (!parsedDocument.success || !parsedParcel.success) return null;
  return planPosterUrl({ document: parsedDocument.data, parcel: parsedParcel.data, palette });
}

export type DrawPlan = typeof drawPlan;
