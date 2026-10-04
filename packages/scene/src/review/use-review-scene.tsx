import type { GroupProps } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import type { ReactNode } from 'react';

import { catalogIndex, type Heightmap, type PlanePoint } from '@parkshape/core';

import type { ReviewLayerProps } from '../components/viewer-modes.js';
import { elevationAt, type SceneBounds } from '../geometry/sample.js';
import type { MotionPreference } from '../motion/rise.js';
import type { ScenePalette } from '../palette/colours.js';

import { reviewTerrainEvents } from './review-events.js';
import { ReviewLayer } from './ReviewLayer.js';

export interface ReviewSceneInput {
  readonly terrain: Heightmap;
  readonly palette: ScenePalette;
  readonly motion: MotionPreference;
  readonly bounds: SceneBounds;
}

export interface ReviewScene {
  /** Ground events for the canvas, or undefined outside review. */
  readonly terrainEvents: GroupProps | undefined;
  /** The outline and chips to draw on the island, or null outside review. */
  readonly layer: ReactNode;
}

/**
 * Review mode's part of the viewer. The page's latest onSelect is read through a ref, so a new
 * callback on each render does not rebuild the ground handlers.
 */
export function useReviewScene(
  review: ReviewLayerProps | undefined,
  input: ReviewSceneInput,
): ReviewScene {
  const { terrain } = input;
  const groundAt = useMemo(
    () => (point: PlanePoint) => elevationAt(terrain, { x: point.x, z: point.y }),
    [terrain],
  );
  const onSelect = useRef(review?.onSelect);
  onSelect.current = review?.onSelect;
  const design = review?.design;
  const terrainEvents = useMemo(
    () =>
      design === undefined
        ? undefined
        : reviewTerrainEvents({
            design,
            catalog: catalogIndex,
            elevationAt: groundAt,
            onSelect: (ref, surfacePoint) => {
              onSelect.current?.(ref, surfacePoint);
            },
          }),
    [design, groundAt],
  );
  const layer =
    review === undefined ? null : <ReviewLayer {...input} review={review} elevationAt={groundAt} />;
  return { terrainEvents, layer };
}
