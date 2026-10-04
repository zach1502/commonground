import { emptyMask, union, type Mask } from '../metrics/raster.js';
import type { PlanePoint } from '../schema/geometry.js';

import type { CompassZone, IntentPlacement, TerrainPreference } from './intent.js';
import { readAt } from './read-at.js';
import { distanceField, pointOf, type Site } from './site.js';

/** Distance over which a preference falls to about a third, in metres. */
const HINT_DECAY_M = 15;
/** A feature this close to a named place counts as near it. */
const NEAR_MET_M = 10;
/** A feature at least this far from a named place counts as away from it. */
const AWAY_MET_M = 20;
/** Cells this close to the boundary count as the edge. */
const EDGE_BAND_M = 8;
/** Ground this flat always counts as flat, even when most of the parcel is flatter. */
const FLAT_SLOPE = 0.02;
const LOW_QUANTILE = 0.25;
const HIGH_QUANTILE = 0.75;
const THIRDS = 3;
const HALF = 0.5;
const MIN_LABEL_CHARS = 3;
const LEADING_THE = /^the\s+/;
const TRAILING_S = /s$/;

const ZONE_GRID: readonly (readonly CompassZone[])[] = [
  ['south-west', 'south', 'south-east'],
  ['west', 'centre', 'east'],
  ['north-west', 'north', 'north-east'],
];

export type Hint =
  | { readonly kind: 'zone'; readonly zone: CompassZone }
  | { readonly kind: 'terrain'; readonly terrain: TerrainPreference }
  | { readonly kind: 'near'; readonly place: string }
  | { readonly kind: 'awayFrom'; readonly place: string };

export interface ResolvedHint {
  readonly hint: Hint;
  /** Metres from each cell to the hint's target cells. */
  readonly distance: Float64Array;
}

/** Something a resident can name in a hint, such as an existing tree or a new pond. */
export interface Place {
  readonly labels: readonly string[];
  readonly mask: Mask;
}

function boundsOf(points: readonly PlanePoint[]) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function third(value: number, min: number, max: number): number {
  const span = max - min;
  const index = span === 0 ? 1 : Math.floor(((value - min) / span) * THIRDS);
  return Math.min(Math.max(index, 0), THIRDS - 1);
}

/** Which ninth of the parcel's bounding box a point falls in. */
export function compassZoneAt(site: Site, point: PlanePoint): CompassZone {
  return compassZoneIn(site.polygon, point);
}

/** Which ninth of the bounding box of a parcel outline a point falls in. */
export function compassZoneIn(polygon: readonly PlanePoint[], point: PlanePoint): CompassZone {
  const { minX, minY, maxX, maxY } = boundsOf(polygon);
  const row = readAt(ZONE_GRID, third(point.y, minY, maxY), []);
  return readAt<CompassZone>(row, third(point.x, minX, maxX), 'centre');
}

function parcelMaskWhere(site: Site, test: (index: number) => boolean): Mask {
  const mask = emptyMask(site.grid);
  site.parcel.cells.forEach((cell, index) => {
    if (cell === 1 && test(index)) mask.cells[index] = 1;
  });
  return mask;
}

export function zoneMask(site: Site, zone: CompassZone): Mask {
  return parcelMaskWhere(site, (index) => compassZoneAt(site, pointOf(site.grid, index)) === zone);
}

function quantile(site: Site, values: ArrayLike<number>, share: number): number {
  const inParcel: number[] = [];
  site.parcel.cells.forEach((cell, index) => {
    if (cell === 1) inParcel.push(readAt(values, index, 0));
  });
  inParcel.sort((a, b) => a - b);
  return readAt(inParcel, Math.floor((inParcel.length - 1) * share), 0);
}

/** Metres from each cell to the parcel boundary or the edge of the grid. */
export function edgeDistance(site: Site): Float64Array {
  const outside = emptyMask(site.grid);
  site.parcel.cells.forEach((cell, index) => {
    outside.cells[index] = cell === 1 ? 0 : 1;
  });
  const field = distanceField(outside);
  const { width, height, cellM } = site.grid;
  return field.map((distance, index) => {
    const i = index % width;
    const j = Math.floor(index / width);
    const border = Math.min(i + HALF, width - i - HALF, j + HALF, height - j - HALF) * cellM;
    return Math.min(distance, border);
  });
}

export function terrainMask(site: Site, terrain: TerrainPreference): Mask {
  switch (terrain) {
    case 'flat': {
      const limit = Math.max(FLAT_SLOPE, quantile(site, site.slope, LOW_QUANTILE));
      return parcelMaskWhere(site, (index) => readAt(site.slope, index, 0) <= limit);
    }
    case 'low': {
      const limit = quantile(site, site.elevation, LOW_QUANTILE);
      return parcelMaskWhere(site, (index) => readAt(site.elevation, index, 0) <= limit);
    }
    case 'high': {
      const limit = quantile(site, site.elevation, HIGH_QUANTILE);
      return parcelMaskWhere(site, (index) => readAt(site.elevation, index, 0) >= limit);
    }
    case 'edge': {
      const distance = edgeDistance(site);
      return parcelMaskWhere(site, (index) => readAt(distance, index, Infinity) <= EDGE_BAND_M);
    }
  }
}

function normalizePlace(name: string): string {
  return name.toLowerCase().trim().replace(LEADING_THE, '').replace(TRAILING_S, '');
}

function labelMatches(label: string, query: string): boolean {
  return label.includes(query) || (label.length >= MIN_LABEL_CHARS && query.includes(label));
}

/** Every place whose label matches the name, combined, or undefined when none does. */
export function findPlace(places: readonly Place[], name: string): Mask | undefined {
  const query = normalizePlace(name);
  const matches = places.filter((place) =>
    place.labels.some((label) => labelMatches(label.toLowerCase(), query)),
  );
  const [first] = matches;
  return first === undefined
    ? undefined
    : union(
        first.mask.grid,
        matches.map(({ mask }) => mask),
      );
}

function hintsOf(placement: IntentPlacement): Hint[] {
  const { zone, terrain, near, awayFrom } = placement;
  return [
    ...(zone === undefined ? [] : [{ kind: 'zone', zone } as const]),
    ...(terrain === undefined ? [] : [{ kind: 'terrain', terrain } as const]),
    ...(near === undefined ? [] : [{ kind: 'near', place: near } as const]),
    ...(awayFrom === undefined ? [] : [{ kind: 'awayFrom', place: awayFrom } as const]),
  ];
}

function targetOf(site: Site, hint: Hint, places: readonly Place[]): Mask | undefined {
  switch (hint.kind) {
    case 'zone':
      return zoneMask(site, hint.zone);
    case 'terrain':
      return terrainMask(site, hint.terrain);
    default:
      return findPlace(places, hint.place);
  }
}

/** Distance fields for each hint, and the place names that match nothing on the site. */
export function resolveHints(
  site: Site,
  placement: IntentPlacement | undefined,
  places: readonly Place[],
) {
  const hints: ResolvedHint[] = [];
  const missing: string[] = [];
  hintsOf(placement ?? {}).forEach((hint) => {
    const target = targetOf(site, hint, places);
    if (target === undefined) {
      if (hint.kind === 'near' || hint.kind === 'awayFrom') missing.push(hint.place);
      return;
    }
    hints.push({ hint, distance: distanceField(target) });
  });
  return { hints, missing };
}

/** 1 where every hint is met, falling toward 0 with distance from what each hint asks. */
export function preferenceAt(hints: readonly ResolvedHint[], index: number): number {
  return hints.reduce((product, { hint, distance }) => {
    const decay = Math.exp(-readAt(distance, index, Infinity) / HINT_DECAY_M);
    return product * (hint.kind === 'awayFrom' ? 1 - decay : decay);
  }, 1);
}

export function hintMet(resolved: ResolvedHint | undefined, index: number): boolean {
  if (resolved === undefined) return true;
  const distance = readAt(resolved.distance, index, Infinity);
  switch (resolved.hint.kind) {
    case 'near':
      return distance <= NEAR_MET_M;
    case 'awayFrom':
      return distance >= AWAY_MET_M;
    default:
      return distance === 0;
  }
}
