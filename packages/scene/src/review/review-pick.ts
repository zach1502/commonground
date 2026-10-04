import type { CatalogIndex, DesignDocument, ElementRef, PlanePoint } from '@parkshape/core';

import { elementAt } from '../editor/selection.js';

/** A point on the ground a person tapped, and the item model the pointer ray passed through. */
export interface ReviewTap {
  readonly point: PlanePoint;
  readonly aimed?: string | undefined;
}

/** The element a tap picked. Paths and areas keep the tap point, so a chip can sit there. */
export interface ReviewPick {
  readonly ref: ElementRef;
  readonly surfacePoint?: PlanePoint;
}

function itemPick(design: DesignDocument, id: string): ReviewPick | undefined {
  const item = design.items.find((entry) => entry.id === id);
  return item === undefined ? undefined : { ref: { elementId: item.id, elementKind: 'item' } };
}

/**
 * The element under a tap in review: the item whose model the ray passed through, then items,
 * path ribbons and areas on the ground. Locked elements count, because residents comment on the
 * park as it is too. Bare ground picks nothing.
 */
export function reviewPickAt(
  tap: ReviewTap,
  design: DesignDocument,
  catalog: CatalogIndex,
): ReviewPick | undefined {
  const aimed = tap.aimed === undefined ? undefined : itemPick(design, tap.aimed);
  if (aimed !== undefined) return aimed;
  const hit = elementAt(tap.point, design, catalog);
  if (hit === null) return undefined;
  if (hit.kind === 'item') return itemPick(design, hit.id);
  const ref = (hit.kind === 'path' ? design.paths : design.areas).find(
    (entry) => entry.id === hit.id,
  );
  if (ref === undefined) return undefined;
  return { ref: { elementId: ref.id, elementKind: hit.kind }, surfacePoint: tap.point };
}
