import type { CatalogItem, PlanePoint } from '@parkshape/core';

import type { ItemsListRow } from '../editor/items-list.js';
import type { PlacementValidity } from '../editor/placement-validity.js';
import type { ElementRef } from '../editor/types.js';

import type { EditorStrings } from './strings.js';

/** The floating toolbar's actions, run on one row's element. */
export type RowAction = 'rotate' | 'duplicate' | 'delete';

export interface ItemsListProps {
  readonly rows: readonly ItemsListRow[];
  readonly strings: EditorStrings;
  /** Entries the add form offers; only point items can be placed by coordinates. */
  readonly catalog: readonly CatalogItem[];
  readonly onSelect: (ref: ElementRef) => void;
  readonly onNudge: (delta: PlanePoint) => void;
  readonly onRowAction: (action: RowAction, ref: ElementRef) => void;
  readonly onAdd: (catalogId: string, position: PlanePoint) => PlacementValidity;
}
