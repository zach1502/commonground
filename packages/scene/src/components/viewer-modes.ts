import type { DesignDocument, ElementRef, PlanePoint } from '@parkshape/core';

/**
 * Review mode on the viewer: comment counts per element and the selected element. The viewer
 * mounts no editor commands, so review cannot change the design.
 */
export interface ReviewLayerProps {
  /** The design the viewer draws, in the stored shape, so a tap finds the element's id. */
  readonly design: DesignDocument;
  /** Comment count per element id, as the page wants it shown; elements with none are left out. */
  readonly counts: ReadonlyMap<string, number>;
  readonly selected: ElementRef | undefined;
  /**
   * A tap on an element, with the tap point on a path or area; undefined when the page clears
   * the selection. Bare ground does nothing.
   */
  readonly onSelect: (ref: ElementRef | undefined, surfacePoint?: PlanePoint) => void;
  /** The accessible name of a count chip, such as "3 comments on Bench". */
  readonly chipLabel: (elementId: string, count: number) => string;
  /** Grows each time the page wants the camera on the selected element, as the list does. */
  readonly frameRequest: number;
}

export type { WalkProps } from '../walk/walk-props.js';
