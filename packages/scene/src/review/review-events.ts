import type { GroupProps, ThreeEvent } from '@react-three/fiber';

import type { CatalogIndex, DesignDocument, ElementRef, PlanePoint } from '@parkshape/core';

import { itemUnderRay } from '../editor/ray-pick.js';

import { reviewPickAt } from './review-pick.js';

/** A press that moves less than this is a tap; more is an orbit drag. The editor uses the same. */
export const REVIEW_CLICK_SLOP_PX = 4;

export interface ReviewEventsInput {
  readonly design: DesignDocument;
  readonly catalog: CatalogIndex;
  readonly elevationAt: (point: PlanePoint) => number;
  readonly onSelect: (ref: ElementRef, surfacePoint: PlanePoint | undefined) => void;
}

/**
 * Ground pointer events for review mode. Only a tap is heard, and it only reports what it picked,
 * so review has no way to move, add or delete anything in the design.
 */
export function reviewTerrainEvents(input: ReviewEventsInput): GroupProps {
  const { design, catalog, elevationAt, onSelect } = input;
  return {
    onClick: (event: ThreeEvent<MouseEvent>) => {
      if (event.delta > REVIEW_CLICK_SLOP_PX) return;
      const aimed = itemUnderRay({
        ray: event.ray,
        document: design,
        catalog,
        elevationAt,
        beforeM: event.distance,
      });
      const pick = reviewPickAt(
        { point: { x: event.point.x, y: event.point.z }, aimed: aimed ?? undefined },
        design,
        catalog,
      );
      if (pick !== undefined) onSelect(pick.ref, pick.surfacePoint);
    },
  };
}
