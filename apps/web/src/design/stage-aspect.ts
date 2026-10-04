import { parcelSchema, THUMBNAIL_HEIGHT_PX, THUMBNAIL_WIDTH_PX } from '@parkshape/core';

const DECIMALS = 3;
const FALLBACK = String(Number((THUMBNAIL_HEIGHT_PX / THUMBNAIL_WIDTH_PX).toFixed(DECIMALS)));

function extent(values: readonly number[]): number {
  return Math.max(...values) - Math.min(...values);
}

function rounded(value: number): string {
  return String(Number(value.toFixed(DECIMALS)));
}

/**
 * The parcel's depth over its width, so a phone stage can take the park's shape: 0.488 for the
 * 175 by 85 m seeded park. A parcel that does not parse gets the picture's shape.
 */
export function parcelDepthRatio(parcel: unknown): string {
  const parsed = parcelSchema.shape.polygon.safeParse((parcel as { polygon?: unknown }).polygon);
  if (!parsed.success) return FALLBACK;
  const width = extent(parsed.data.map((point) => point.x));
  const depth = extent(parsed.data.map((point) => point.y));
  if (width <= 0 || depth <= 0) return FALLBACK;
  return rounded(depth / width);
}
