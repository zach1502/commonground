import type { ScenePalette } from '../palette/colours.js';
import type { ItemCategory } from '../types.js';

export type PlaceholderShape =
  | {
      readonly kind: 'box';
      readonly widthM: number;
      readonly heightM: number;
      readonly depthM: number;
    }
  | { readonly kind: 'cylinder'; readonly radiusM: number; readonly heightM: number }
  | { readonly kind: 'sphere'; readonly radiusM: number };

/** One primitive of a stand-in model; baseY is the height of its lowest point above the ground. */
export interface PlaceholderPart {
  readonly shape: PlaceholderShape;
  readonly baseY: number;
  readonly colour: keyof ScenePalette;
}

const TREE: readonly PlaceholderPart[] = [
  { shape: { kind: 'cylinder', radiusM: 0.18, heightM: 2.4 }, baseY: 0, colour: 'soilDark' },
  { shape: { kind: 'sphere', radiusM: 1.8 }, baseY: 1.8, colour: 'foliage' },
];
const BUILDING: readonly PlaceholderPart[] = [
  { shape: { kind: 'box', widthM: 6, heightM: 3.5, depthM: 4 }, baseY: 0, colour: 'pathSurface' },
];
const BENCH: readonly PlaceholderPart[] = [
  { shape: { kind: 'box', widthM: 1.8, heightM: 0.45, depthM: 0.5 }, baseY: 0, colour: 'soil' },
];
const PLAY: readonly PlaceholderPart[] = [
  { shape: { kind: 'box', widthM: 3, heightM: 2.2, depthM: 3 }, baseY: 0, colour: 'warning' },
];
const OTHER: readonly PlaceholderPart[] = [
  { shape: { kind: 'box', widthM: 1, heightM: 1, depthM: 1 }, baseY: 0, colour: 'info' },
];

const PARTS: Readonly<Record<ItemCategory, readonly PlaceholderPart[]>> = {
  tree: TREE,
  shrub: TREE,
  building: BUILDING,
  bench: BENCH,
  play: PLAY,
  other: OTHER,
};

/** Primitives that stand in for a model until the asset pipeline supplies its GLB. */
export function placeholderParts(category: ItemCategory): readonly PlaceholderPart[] {
  return PARTS[category];
}
