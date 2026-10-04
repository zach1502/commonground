import type { SlopeLimits } from '../metrics/slopes.js';
import type { PlanePoint } from '../schema/geometry.js';

import { findPath, type CostGrid } from './astar.js';
import { mainRegion, regionSize } from './path-region.js';
import { slopeSteps } from './path-steps.js';
import { nearestAllowed, pointOf, type Site } from './site.js';

/**
 * Entrances move onto ground where paths keep within the slope limits when that ground joins at
 * least this share of the ground a path could cover. Below it the compliant ground is only
 * pockets, and entrances stay where they are.
 */
const MIN_COMPLIANT_SHARE = 0.25;
/** Extra cost per metre of a step that breaks a slope limit, so such steps stay short. */
const OFF_LIMIT_STEP_COST = 1000;
/** A feature's path end moves onto compliant ground when that is at most this much further. */
const TARGET_SNAP_SLACK_M = 8;

export interface NetworkInput {
  readonly site: Site;
  /** Slope-weighted walking cost; Infinity where the path may not go. */
  readonly costs: CostGrid;
  readonly widthM: number;
  readonly limits: SlopeLimits;
}

/** The grids a plan routes over, and where its ends snap to. */
export interface Networks {
  readonly site: Site;
  /** Only steps within the slope limits. */
  readonly strict: CostGrid;
  /** Every step, with steps that break a limit at a high cost. */
  readonly soft: CostGrid;
  /** Passable cells joined within the limits, or all joined passable cells on steep parcels. */
  readonly main: Uint8Array;
  readonly passable: Uint8Array;
}

export function networksFor(input: NetworkInput): Networks {
  const { site, costs } = input;
  const steps = slopeSteps(site, input);
  const strict = { ...costs, steps };
  const strictMain = mainRegion(strict);
  const looseMain = mainRegion(costs);
  const compliant = regionSize(strictMain) >= MIN_COMPLIANT_SHARE * regionSize(looseMain);
  return {
    site,
    strict,
    soft: { ...costs, steps, stepPenalty: OFF_LIMIT_STEP_COST },
    main: compliant ? strictMain : looseMain,
    passable: Uint8Array.from(costs.cost, (cost) => (cost === Infinity ? 0 : 1)),
  };
}

/** A route within the slope limits where one exists, else the one that breaks them least. */
export function routeCells(networks: Networks, from: number, to: number): number[] | undefined {
  return findPath(networks.strict, from, to) ?? findPath(networks.soft, from, to);
}

function distanceTo(site: Site, cell: number, point: PlanePoint): number {
  const centre = pointOf(site.grid, cell);
  return Math.hypot(centre.x - point.x, centre.y - point.y);
}

/** The cell an entrance path starts from: the nearest cell of the main region. */
export function entranceCell(networks: Networks, point: PlanePoint): number | undefined {
  return nearestAllowed(networks.site.grid, networks.main, point);
}

/**
 * The cell a path to a feature ends at: the nearest passable cell, or the nearest cell of the
 * main region when that is only a few metres further, so the path need not climb a bank.
 */
export function targetCell(networks: Networks, centre: PlanePoint): number | undefined {
  const { site } = networks;
  const nearest = nearestAllowed(site.grid, networks.passable, centre);
  const compliant = nearestAllowed(site.grid, networks.main, centre);
  if (nearest === undefined || compliant === undefined) return nearest;
  const extra = distanceTo(site, compliant, centre) - distanceTo(site, nearest, centre);
  return extra <= TARGET_SNAP_SLACK_M ? compliant : nearest;
}
