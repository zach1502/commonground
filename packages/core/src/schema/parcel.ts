import { z } from 'zod';

import { polygonArea, polygonContains, polygonSchema, type LocalPoint } from './geometry.js';
import { parcelIdSchema } from './ids.js';
import type { SquareMetres } from './units.js';

const MAX_LATITUDE = 90;
const MAX_LONGITUDE = 180;

export const parcelSchema = z.strictObject({
  id: parcelIdSchema,
  name: z.string().min(1),
  /** Boundary in local metres relative to origin. */
  polygon: polygonSchema,
  /** WGS84 position of the local frame's (0, 0). */
  origin: z.strictObject({
    lat: z.number().min(-MAX_LATITUDE).max(MAX_LATITUDE),
    lon: z.number().min(-MAX_LONGITUDE).max(MAX_LONGITUDE),
  }),
});

export type Parcel = z.infer<typeof parcelSchema>;
export type ParcelInput = z.input<typeof parcelSchema>;

export function parcelAreaM2(parcel: Parcel): SquareMetres {
  return polygonArea(parcel.polygon);
}

export function parcelContains(parcel: Parcel, point: LocalPoint): boolean {
  return polygonContains(parcel.polygon, point);
}
