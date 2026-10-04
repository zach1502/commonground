import type { Category } from '@parkshape/core';

import type { ContextLayerStrings } from '../context/context-strings.js';
import type { ShortcutRow } from '../editor/keyboard.js';
import type { PaletteGroupId } from '../editor/palette.js';
import type { TerraformMode } from '../editor/terraform/types.js';
import type { ViewerStrings } from '../overlay/strings.js';

/**
 * Editor text; apps pass it in from their locale files. Templates fill {name} style slots.
 * Nothing in the editor components writes user-visible text of its own.
 */
export interface EditorStrings {
  readonly viewer: ViewerStrings;
  /** Display names keyed by catalog id. */
  readonly catalog: Readonly<Record<string, string>>;
  readonly categories: Readonly<Record<Category, string>>;
  readonly palette: {
    readonly heading: string;
    readonly paint: string;
    readonly paintHelp: string;
    /** Summary of the closed disclosure that holds the palette while terraforming. */
    readonly terraformFold: string;
    /** The picker's tab names. */
    readonly groups: Readonly<Record<PaletteGroupId, string>>;
    /** A tile's cost per square metre or per raised bed; {cost} is the dollar amount. */
    readonly costPerM2: string;
    readonly costPerModule: string;
  };
  readonly tools: {
    readonly label: string;
    readonly select: string;
    readonly path: string;
    readonly area: string;
    readonly terraform: string;
    readonly snap: string;
    readonly snapHelp: string;
    readonly itemsList: string;
    readonly shortcuts: string;
  };
  readonly toolbar: {
    readonly label: string;
    readonly rotate: string;
    readonly duplicate: string;
    readonly delete: string;
    readonly locked: string;
  };
  /** Ghost labels; {name} is the locked item, the zone or the item being placed. */
  readonly reasons: {
    readonly lockedFootprint: string;
    readonly forbiddenZone: string;
    readonly tooSteep: string;
    readonly unknownItem: string;
    readonly outsidePark: string;
  };
  readonly notices: {
    readonly locked: string;
    readonly areaTooSmall: string;
    readonly pathTooShort: string;
    /** Shown after a blocked click, with {reason} from the ghost vocabulary. */
    readonly rejected: string;
    readonly pathHint: string;
    readonly areaHint: string;
    readonly cornerHint: string;
    /** Shown on the canvas while placing, with {name}. */
    readonly placing: string;
  };
  readonly properties: {
    readonly heading: string;
    readonly many: string;
    /** Label for the selected item's catalog category, such as Seating. */
    readonly kind: string;
    /** Label for the catalog price of one of the selected item. */
    readonly cost: string;
    readonly x: string;
    readonly y: string;
    readonly rotation: string;
    readonly area: string;
    readonly areaValue: string;
    /** Live label while shaping an area, with {area} and {plots}. */
    readonly areaSummary: string;
    readonly plots: string;
    readonly length: string;
    readonly lengthValue: string;
    readonly addCorner: string;
  };
  readonly itemsList: {
    readonly heading: string;
    readonly empty: string;
    readonly position: string;
    readonly locked: string;
    readonly nudge: string;
    readonly north: string;
    readonly south: string;
    readonly east: string;
    readonly west: string;
    readonly delete: string;
    /** Row action names, with {name}. */
    readonly rotate: string;
    readonly duplicate: string;
    readonly addHeading: string;
    readonly addItem: string;
    readonly addX: string;
    readonly addY: string;
    readonly addButton: string;
  };
  readonly shortcuts: {
    readonly heading: string;
    readonly close: string;
    readonly keyColumn: string;
    readonly actionColumn: string;
    readonly rows: Readonly<
      Record<ShortcutRow, { readonly keys: string; readonly action: string }>
    >;
  };
  readonly hints: {
    /** One line each, shown on the first visit until the resident does the move. */
    readonly camera: string;
    readonly path: string;
    /** Accessible name for the icon-only dismiss button on each hint. */
    readonly dismiss: string;
  };
  readonly smallScreen: { readonly heading: string; readonly body: string; readonly link: string };
  /** The Layers menu and the legend for the streets and stops around the park. */
  readonly layers: ContextLayerStrings;
  readonly terraform: {
    readonly heading: string;
    readonly modeLabel: string;
    readonly modes: Readonly<Record<TerraformMode, string>>;
    readonly radius: string;
    readonly strength: string;
    readonly selectItemHint: string;
    readonly readoutHeading: string;
    /** Each takes a {value} slot. */
    readonly cut: string;
    readonly fill: string;
    readonly net: string;
    readonly trucks: string;
    readonly disturbed: string;
    /** The key for the red hatching on blocked ground. */
    readonly hatchKey: string;
  };
}

/** Which optional editor features the app has switched on. */
export interface EditorFeatures {
  readonly terraform: 'on' | 'off';
}

/** Fills {slot} markers in a template. */
export function fill(template: string, values: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (slot, name: string) =>
    name in values ? String(values[name]) : slot,
  );
}

const oneDecimal = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 1 });
const twoDecimals = new Intl.NumberFormat('en-CA', { maximumFractionDigits: 2 });

export const formatArea = (value: number) => oneDecimal.format(value);
export const formatMetres = (value: number) => twoDecimals.format(value);
