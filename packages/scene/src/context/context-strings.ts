import type { ContextFeatureKind } from '@parkshape/core';

/** Text for the Layers menu and the legend; apps pass it in from their locale files. */
export interface ContextLayerStrings {
  /** The accessible name and tooltip of the icon-only menu button. */
  readonly menu: string;
  /** Checkbox labels, such as "Bus stops". */
  readonly kinds: Readonly<Record<ContextFeatureKind, string>>;
  /** Legend rows, such as "Bus stop". */
  readonly legend: Readonly<Record<ContextFeatureKind, string>>;
  /** Shown in the menu in place of the boxes when the context did not load. */
  readonly failed: string;
}
