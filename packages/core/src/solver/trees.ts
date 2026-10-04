import { PERCENT_SCALE } from '../constants.js';
import { rasterizeCircle } from '../metrics/raster.js';
import type { Random } from '../ports/random.js';
import { designItemSchema, type DesignItem } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';

import type { TreeRequest } from './features.js';
import type { IdSource } from './ids.js';
import { cellAt, pointOf, type Site } from './site.js';

/** Crowns may overlap: trunks sit at least this share of the two crown radii apart. */
const SPACING_SHARE = 0.8;
/** Bridson's k: candidates tried around each active tree before it is retired. */
const CANDIDATES_PER_TREE = 30;
/** Random free cells tried when every active tree is retired. */
const SEED_ATTEMPTS = 60;
/** A generated layout never adds more trees than this. */
const MAX_NEW_TREES = 400;
const FULL_TURN_DEG = 360;
const JITTER_MIN = 0.9;
const JITTER_SPAN = 0.2;
const JITTER_DECIMALS = 100;
const ANNULUS_OUTER = 2;
/**
 * Crown radius of the red alder planted when no species is given. The scatter gets its species
 * as input and does not read the catalog, so the median of 3 checks of the alder's spread is here.
 */
const FALLBACK_CROWN_RADIUS_M = 4.5;

export interface TreeSpecies {
  readonly catalogId: string;
  readonly radiusM: number;
}

export interface ExistingTree {
  readonly position: PlanePoint;
  readonly radiusM: number;
}

export interface TreeScatterInput {
  readonly site: Site;
  /** 1 where a new trunk may stand. */
  readonly free: Uint8Array;
  readonly existing: readonly ExistingTree[];
  /** Species to draw from; never empty. */
  readonly species: readonly TreeSpecies[];
  /** Trees the resident asked for; planted first, whatever the canopy. */
  readonly requested: readonly TreeRequest[];
  readonly targetPercent: number;
  readonly random: Random;
  readonly ids: IdSource;
}

export interface TreeScatter {
  readonly items: readonly DesignItem[];
  /** Mature canopy over the parcel with the new trees, as a percent. */
  readonly canopyPercent: number;
}

interface Planted {
  readonly position: PlanePoint;
  readonly radiusM: number;
}

interface ScatterState {
  readonly input: TreeScatterInput;
  readonly trees: Planted[];
  readonly active: Planted[];
  readonly items: DesignItem[];
  readonly canopy: Uint8Array;
  readonly queue: TreeSpecies[];
  covered: number;
}

export function minimumSpacing(radiusA: number, radiusB: number): number {
  return SPACING_SHARE * (radiusA + radiusB);
}

function pick<T>(values: readonly T[], random: Random): T | undefined {
  return values[Math.floor(random.next() * values.length)];
}

function canopyPercent(state: ScatterState): number {
  const cells = state.input.site.parcelCells;
  return cells === 0 ? 0 : (state.covered / cells) * PERCENT_SCALE;
}

function addCrown(state: ScatterState, tree: Planted): void {
  const { site } = state.input;
  rasterizeCircle(site.grid, tree.position, tree.radiusM).cells.forEach((cell, index) => {
    if (cell === 1 && site.parcel.cells[index] === 1 && state.canopy[index] === 0) {
      state.canopy[index] = 1;
      state.covered += 1;
    }
  });
}

function fits(state: ScatterState, point: PlanePoint, radiusM: number): boolean {
  const cell = cellAt(state.input.site.grid, point);
  if (cell === undefined || state.input.free[cell] !== 1) return false;
  return state.trees.every(
    (tree) =>
      Math.hypot(tree.position.x - point.x, tree.position.y - point.y) >=
      minimumSpacing(tree.radiusM, radiusM),
  );
}

function nextSpecies(state: ScatterState): TreeSpecies {
  const fallback = state.input.species[0] ?? {
    catalogId: 'red-alder',
    radiusM: FALLBACK_CROWN_RADIUS_M,
  };
  return state.queue[0] ?? pick(state.input.species, state.input.random) ?? fallback;
}

function plant(state: ScatterState, species: TreeSpecies, position: PlanePoint): void {
  const { random, ids } = state.input;
  const tree = { position, radiusM: species.radiusM };
  if (state.queue[0] === species) state.queue.shift();
  state.trees.push(tree);
  state.active.push(tree);
  addCrown(state, tree);
  const scaleJitter =
    Math.round((JITTER_MIN + JITTER_SPAN * random.next()) * JITTER_DECIMALS) / JITTER_DECIMALS;
  state.items.push(
    designItemSchema.parse({
      id: ids.next(),
      catalogId: species.catalogId,
      position,
      rotationDeg: Math.floor(random.next() * FULL_TURN_DEG),
      locked: false,
      scaleJitter,
    }),
  );
}

/** Tries candidates in the annulus around one active tree; retires it when none fits. */
function growFrom(state: ScatterState, index: number): void {
  const { random } = state.input;
  const origin = state.active[index];
  if (origin === undefined) return;
  for (let attempt = 0; attempt < CANDIDATES_PER_TREE; attempt += 1) {
    const species = nextSpecies(state);
    const spacing = minimumSpacing(origin.radiusM, species.radiusM);
    const reach = spacing * (1 + (ANNULUS_OUTER - 1) * random.next());
    const angle = random.next() * Math.PI * ANNULUS_OUTER;
    const point = {
      x: origin.position.x + reach * Math.cos(angle),
      y: origin.position.y + reach * Math.sin(angle),
    };
    if (fits(state, point, species.radiusM)) {
      plant(state, species, point);
      return;
    }
  }
  state.active.splice(index, 1);
}

/** Plants a tree on a random free cell; 'full' when every attempt fails. */
function seed(state: ScatterState, freeCells: readonly number[]): 'planted' | 'full' {
  const { random, site } = state.input;
  for (let attempt = 0; attempt < SEED_ATTEMPTS; attempt += 1) {
    const cell = pick(freeCells, random);
    const species = nextSpecies(state);
    if (cell !== undefined && fits(state, pointOf(site.grid, cell), species.radiusM)) {
      plant(state, species, pointOf(site.grid, cell));
      return 'planted';
    }
  }
  return 'full';
}

function wantsMore(state: ScatterState): boolean {
  if (state.items.length >= MAX_NEW_TREES) return false;
  return state.queue.length > 0 || canopyPercent(state) < state.input.targetPercent;
}

function requestedQueue(input: TreeScatterInput): TreeSpecies[] {
  return input.requested.flatMap((request) => {
    const named = input.species.find((species) => species.catalogId === request.catalogId);
    const species = named ?? input.species[0];
    return species === undefined ? [] : Array.from({ length: request.count }, () => species);
  });
}

/** Poisson-disc scatter (Bridson) on free cells until the mature canopy reaches the target. */
export function scatterTrees(input: TreeScatterInput): TreeScatter {
  const state: ScatterState = {
    input,
    trees: [...input.existing],
    active: [],
    items: [],
    canopy: new Uint8Array(input.free.length),
    queue: requestedQueue(input),
    covered: 0,
  };
  input.existing.forEach((tree) => {
    addCrown(state, tree);
  });
  const freeCells = [...input.free.keys()].filter((index) => input.free[index] === 1);
  while (wantsMore(state)) {
    if (state.active.length === 0 && seed(state, freeCells) === 'full') break;
    growFrom(state, Math.floor(input.random.next() * state.active.length));
  }
  return { items: state.items, canopyPercent: canopyPercent(state) };
}
