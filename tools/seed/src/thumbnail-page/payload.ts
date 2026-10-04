import type { Heightmap } from '@parkshape/core';
import type { ThumbnailPicture } from '@parkshape/db/seed';
import type { OfflineFrame } from '@parkshape/scene/thumbnail';

/** The recorded terrain as plain JSON, so Playwright can hand it to the thumbnail page. */
export interface HeightmapPayload {
  readonly width: number;
  readonly height: number;
  readonly resolutionM: number;
  readonly originLocal: { readonly x: number; readonly y: number };
  readonly elevations: readonly number[];
}

const FRAME: Readonly<Record<ThumbnailPicture, OfflineFrame>> = {
  design: 'thumbnail',
  baseline: 'baseline',
};

/** The offline frame for a seed picture: the park today is the large project page render. */
export function frameFor(picture: ThumbnailPicture): OfflineFrame {
  return FRAME[picture];
}

export function heightmapPayload(heightmap: Heightmap): HeightmapPayload {
  const { width, height, resolutionM, originLocal } = heightmap;
  return { width, height, resolutionM, originLocal, elevations: Array.from(heightmap.elevations) };
}

function isPayload(value: unknown): value is HeightmapPayload {
  if (typeof value !== 'object' || value === null) return false;
  const record: { readonly [key in keyof HeightmapPayload]?: unknown } = value;
  return (
    typeof record.width === 'number' &&
    typeof record.height === 'number' &&
    typeof record.resolutionM === 'number' &&
    typeof record.originLocal === 'object' &&
    Array.isArray(record.elevations)
  );
}

/** Rebuilds the heightmap inside the page; throws when the payload is not one. */
export function heightmapFromPayload(value: unknown): Heightmap {
  if (!isPayload(value)) throw new Error('The thumbnail page got no heightmap.');
  return { ...value, elevations: Float32Array.from(value.elevations) };
}
