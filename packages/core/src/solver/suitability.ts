import type { CatalogIndex } from '../catalog/catalog.js';
import { designFootprints } from '../metrics/footprints.js';
import { rasterizeCircle, rasterizePolygon, union, type Mask } from '../metrics/raster.js';
import { lockedTrees } from '../metrics/terraform.js';
import type { DesignDocument, Zone } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';

import { readAt } from './read-at.js';
import { nearestAllowed, type Site } from './site.js';

/** Score lost per unit of slope, so ground at 20% slope scores 0. */
const SLOPE_PENALTY = 5;
/** How far an entrance sits inside the parcel corner or edge midpoint, in metres. */
const ENTRANCE_INSET_M = 1.5;
const HALF = 0.5;

/** Cells nothing new may cover. */
export interface Blockers {
  readonly forbidden: Mask;
  /** Footprints of locked items and areas from the baseline. */
  readonly locked: Mask;
  /** Protected root zones of locked trees. */
  readonly rootZones: Mask;
  /** Footprints of unlocked baseline items and areas the layout keeps. */
  readonly kept: Mask;
  /** Baseline paths the layout keeps. New paths may cross them; nothing else may cover them. */
  readonly keptPaths: Mask;
}

export interface BlockerInput {
  readonly site: Site;
  /** The baseline elements the layout keeps, locked or not. */
  readonly baseline: DesignDocument;
  /** Zones of any kind; only forbidden zones block. */
  readonly zones: readonly Zone[];
  readonly catalog: CatalogIndex;
  readonly rootZonePerDbhCm: number;
}

export function siteBlockers(input: BlockerInput): Blockers {
  const { site, catalog } = input;
  const { grid } = site;
  const forbidden = input.zones
    .filter((zone) => zone.kind === 'forbidden')
    .map((zone) => rasterizePolygon(grid, zone.polygon));
  const footprints = designFootprints({ document: input.baseline, catalog, grid });
  const masksWhere = (test: (footprint: (typeof footprints)[number]) => boolean) =>
    union(
      grid,
      footprints.filter(test).map((footprint) => footprint.mask),
    );
  const roots = lockedTrees(input.baseline, catalog).map((tree) =>
    rasterizeCircle(grid, tree.position, tree.dbhCm * input.rootZonePerDbhCm),
  );
  return {
    forbidden: union(grid, forbidden),
    locked: masksWhere((footprint) => footprint.locked && footprint.kind !== 'path'),
    rootZones: union(grid, roots),
    kept: masksWhere((footprint) => !footprint.locked && footprint.kind !== 'path'),
    keptPaths: masksWhere((footprint) => footprint.kind === 'path'),
  };
}

/** 1 on cells that no new footprint may cover. */
export function isBlocked(blockers: Blockers, index: number): boolean {
  return [
    blockers.forbidden,
    blockers.locked,
    blockers.rootZones,
    blockers.kept,
    blockers.keptPaths,
  ].some((mask) => mask.cells[index] === 1);
}

/** 1 on flat open ground, less on slopes, 0 where nothing new may go. */
export function suitabilityGrid(site: Site, blockers: Blockers): Float64Array {
  const score = new Float64Array(site.parcel.cells.length);
  site.parcel.cells.forEach((inParcel, index) => {
    const blocked = inParcel === 0 || isBlocked(blockers, index);
    const slope = readAt(site.slope, index, 0);
    score[index] = blocked ? 0 : Math.max(0, 1 - SLOPE_PENALTY * slope);
  });
  return score;
}

function centroidOf(polygon: readonly PlanePoint[]): PlanePoint {
  const total = polygon.reduce((sum, point) => ({ x: sum.x + point.x, y: sum.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: total.x / polygon.length, y: total.y / polygon.length };
}

function insetToward(point: PlanePoint, target: PlanePoint): PlanePoint {
  const length = Math.hypot(target.x - point.x, target.y - point.y);
  if (length === 0) return point;
  const step = Math.min(ENTRANCE_INSET_M, length) / length;
  return { x: point.x + (target.x - point.x) * step, y: point.y + (target.y - point.y) * step };
}

/** Corners and edge midpoints in ring order, as the points people walk in from. */
function entrancePoints(polygon: readonly PlanePoint[]): PlanePoint[] {
  return polygon.flatMap((corner, index) => {
    const next = readAt(polygon, (index + 1) % polygon.length, corner);
    return [corner, { x: (corner.x + next.x) * HALF, y: (corner.y + next.y) * HALF }];
  });
}

/** Free cells nearest each entrance point, in ring order, without repeats. */
export function entranceCells(site: Site, free: Uint8Array): number[] {
  const centre = centroidOf(site.polygon);
  const cells = entrancePoints(site.polygon).flatMap((point) => {
    const cell = nearestAllowed(site.grid, free, insetToward(point, centre));
    return cell === undefined ? [] : [cell];
  });
  return cells.filter((cell, index) => cells.indexOf(cell) === index);
}
