import type { Heightmap, Random } from '@parkshape/core';

import type { MotionPreference } from '../motion/rise.js';
import type { ScenePalette } from '../palette/colours.js';
import type { GroundPoint, ParkDocument } from '../types.js';

import type { InstanceTransform } from './instances.js';
import { elevationAt } from './sample.js';
import { FULL_TURN, symmetric } from './vector-layout.js';

/** One stacked block of a stand-in person, from the feet up. */
export interface FigurePart {
  readonly widthM: number;
  readonly heightM: number;
  readonly depthM: number;
  readonly colour: keyof ScenePalette;
}

/** Legs, body and head of a 1.7 m person; merged into one mesh so all figures are one draw. */
export const FIGURE_PARTS: readonly FigurePart[] = [
  { widthM: 0.3, heightM: 0.8, depthM: 0.2, colour: 'soilDark' },
  { widthM: 0.42, heightM: 0.66, depthM: 0.24, colour: 'info' },
  { widthM: 0.22, heightM: 0.24, depthM: 0.22, colour: 'pathSurface' },
];

export function figureHeightM(parts: readonly FigurePart[]): number {
  return parts.reduce((total, part) => total + part.heightM, 0);
}

export const CLUTTER_KINDS = ['rock', 'tuft'] as const;
export type ClutterKind = (typeof CLUTTER_KINDS)[number];
/** DESIGN.md "Props and density": clutter hides once the camera is farther than this. */
export const CLUTTER_HIDE_BEYOND_M = 250;

// DESIGN.md "Props and density": 8 to 12 figures and 60 to 120 clutter instances.
const FIGURE_RANGE = { min: 8, max: 12 };
const CLUTTER_PER_TREE = 4;
const CLUTTER_RANGE = { min: 60, max: 120 };
const CLUTTER_RING_M = { inner: 1.2, outer: 4 };
const CLUTTER_SCALE = { min: 0.6, max: 1.4 };
// Keeps figures off the exact path centre, as people walk to one side.
const FIGURE_SIDE_STEP_M = 0.6;
const BIRD_RANGE = { min: 6, max: 10 };
const BIRD_HEIGHT_M = { min: 20, max: 30 };
const BIRD_RADIUS_M = { min: 25, max: 60 };
// Seconds per lap, slow enough to read as gliding.
const BIRD_LAP_S = { min: 40, max: 70 };

export interface ClutterGroup {
  readonly kind: ClutterKind;
  readonly transforms: readonly InstanceTransform[];
}

export interface DressingLayout {
  readonly figures: readonly InstanceTransform[];
  readonly clutter: readonly ClutterGroup[];
}

export interface DressingInput {
  readonly heightmap: Heightmap;
  readonly document: ParkDocument;
  /** Where the trees stand; the clutter gathers under them. */
  readonly trees: readonly GroundPoint[];
  readonly random: Random;
}

function between(random: Random, range: { min: number; max: number }): number {
  return range.min + random.next() * (range.max - range.min);
}

function standing(heightmap: Heightmap, point: GroundPoint, extra: Partial<InstanceTransform>) {
  return {
    position: { ...point, y: elevationAt(heightmap, point) },
    rotationY: 0,
    scale: 1,
    ...extra,
  };
}

function pathPoints(document: ParkDocument): GroundPoint[] {
  return document.paths.flatMap((path) => [...path.points]);
}

function figures({ heightmap, document, random }: DressingInput): InstanceTransform[] {
  const spots = pathPoints(document);
  if (spots.length === 0) return [];
  const count = Math.round(between(random, FIGURE_RANGE));
  return Array.from({ length: count }, () => {
    const spot = spots[Math.floor(random.next() * spots.length)] ?? { x: 0, z: 0 };
    const side = symmetric(random.next()) * FIGURE_SIDE_STEP_M;
    return standing(
      heightmap,
      { x: spot.x + side, z: spot.z - side },
      { rotationY: random.next() * FULL_TURN },
    );
  });
}

function clutter({ heightmap, trees, random }: DressingInput): ClutterGroup[] {
  const wanted = Math.min(
    Math.max(trees.length * CLUTTER_PER_TREE, CLUTTER_RANGE.min),
    CLUTTER_RANGE.max,
  );
  const byKind = new Map<ClutterKind, InstanceTransform[]>(CLUTTER_KINDS.map((kind) => [kind, []]));
  for (let index = 0; index < wanted && trees.length > 0; index += 1) {
    const tree = trees[index % trees.length];
    if (tree === undefined) break;
    const angle = random.next() * FULL_TURN;
    const reach = between(random, { min: CLUTTER_RING_M.inner, max: CLUTTER_RING_M.outer });
    const point = { x: tree.x + Math.cos(angle) * reach, z: tree.z + Math.sin(angle) * reach };
    const kind = CLUTTER_KINDS[index % CLUTTER_KINDS.length] ?? 'tuft';
    byKind
      .get(kind)
      ?.push(
        standing(heightmap, point, { rotationY: angle, scale: between(random, CLUTTER_SCALE) }),
      );
  }
  return [...byKind].flatMap(([kind, transforms]) =>
    transforms.length === 0 ? [] : [{ kind, transforms }],
  );
}

/** Figures on the paths and clutter under the trees, from the seeded random port. */
export function dressingLayout(input: DressingInput): DressingLayout {
  return { figures: figures(input), clutter: clutter(input) };
}

export interface BirdFlight {
  readonly heightM: number;
  readonly radiusM: number;
  readonly lapS: number;
  readonly phase: number;
}

/** Slow circles over the parcel; none with reduced motion. */
export function birdFlights(input: {
  readonly random: Random;
  readonly motion: MotionPreference;
}): BirdFlight[] {
  if (input.motion === 'reduced') return [];
  const { random } = input;
  const count = Math.round(between(random, BIRD_RANGE));
  return Array.from({ length: count }, () => ({
    heightM: between(random, BIRD_HEIGHT_M),
    radiusM: between(random, BIRD_RADIUS_M),
    lapS: between(random, BIRD_LAP_S),
    phase: random.next() * FULL_TURN,
  }));
}
