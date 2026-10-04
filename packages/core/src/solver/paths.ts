import type { SlopeLimits } from '../metrics/slopes.js';
import type { PathSurface } from '../schema/catalog.js';
import { designPathSchema, type DesignPath } from '../schema/design.js';
import type { PlanePoint } from '../schema/geometry.js';

import type { CostGrid } from './astar.js';
import type { IdSource } from './ids.js';
import type { PathStyle } from './intent.js';
import { entranceCell, networksFor, routeCells, targetCell } from './path-networks.js';
import { shapeRoute } from './path-shape.js';
import { readAt } from './read-at.js';
import { pointOf, type Site } from './site.js';

const NEAREST_ENTRANCES = 2;
/** A ring needs at least two entrances, and a joined loop at least two legs. */
const MIN_RING = 2;

/** A placed feature a path may lead to. */
export interface PathTarget {
  readonly label: string;
  readonly centre: PlanePoint;
  readonly areaM2: number;
}

export interface PathPlanInput {
  readonly site: Site;
  readonly costs: CostGrid;
  /** 1 where the path surface may not cover the cell. */
  readonly blocked: Uint8Array;
  readonly style: PathStyle;
  readonly surface: PathSurface;
  readonly widthM: number;
  /** The accessible running and cross slope limits paths are routed and checked against. */
  readonly limits: SlopeLimits;
  readonly entrances: readonly PlanePoint[];
  readonly targets: readonly PathTarget[];
  readonly ids: IdSource;
}

export interface PathPlan {
  readonly paths: readonly DesignPath[];
  /** Labels of targets no path reaches. */
  readonly unreached: readonly string[];
}

interface Node {
  readonly cell: number;
  readonly label?: string;
}

interface Route {
  readonly from: Node;
  readonly to: Node;
}

function listOf(cell: number | undefined): number[] {
  return cell === undefined ? [] : [cell];
}

function distance(site: Site, a: Node, b: Node): number {
  const p = pointOf(site.grid, a.cell);
  const q = pointOf(site.grid, b.cell);
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** Prim's minimum spanning tree over straight-line distance. */
function spanningRoutes(site: Site, nodes: readonly Node[]): Route[] {
  const [first, ...rest] = nodes;
  if (first === undefined) return [];
  const inTree: Node[] = [first];
  const outside = [...rest];
  const routes: Route[] = [];
  while (outside.length > 0) {
    let best: { from: Node; index: number; length: number } | undefined;
    inTree.forEach((from) => {
      outside.forEach((to, index) => {
        const length = distance(site, from, to);
        if (best === undefined || length < best.length) best = { from, index, length };
      });
    });
    if (best === undefined) break;
    const [to] = outside.splice(best.index, 1);
    if (to !== undefined) routes.push({ from: best.from, to });
    if (to !== undefined) inTree.push(to);
  }
  return routes;
}

function largestTarget(targets: readonly (Node & { areaM2: number })[]) {
  return [...targets].sort((a, b) => b.areaM2 - a.areaM2)[0];
}

function minimalRoutes(
  site: Site,
  entrances: readonly Node[],
  targets: readonly (Node & { areaM2: number })[],
) {
  const [firstEntrance] = entrances;
  const target = largestTarget(targets);
  if (target === undefined || firstEntrance === undefined) return [];
  return [...entrances]
    .sort((a, b) => distance(site, a, target) - distance(site, b, target))
    .slice(0, NEAREST_ENTRANCES)
    .map((from) => ({ from, to: target }));
}

function ringRoutes(entrances: readonly Node[]): Route[] {
  if (entrances.length < MIN_RING) return [];
  return entrances.map((from, index) => ({
    from,
    to: readAt(entrances, (index + 1) % entrances.length, from),
  }));
}

function routesFor(
  input: PathPlanInput,
  entrances: readonly Node[],
  targets: readonly (Node & { areaM2: number })[],
) {
  switch (input.style) {
    case 'loop':
      return ringRoutes(entrances);
    case 'connect-all':
      return spanningRoutes(input.site, [...entrances, ...targets]);
    case 'minimal':
      return minimalRoutes(input.site, entrances, targets);
  }
}

function toPath(input: PathPlanInput, cells: readonly number[]): DesignPath[] {
  const points = shapeRoute(input, cells);
  if (points === undefined) return [];
  const { surface, widthM } = input;
  return [designPathSchema.parse({ id: input.ids.next(), surface, widthM, points })];
}

/** A loop is one closed path when every leg is found, else one path per leg found. */
function joinLoop(legs: readonly (readonly number[])[]): (readonly number[])[] {
  if (legs.length < MIN_RING) return [...legs];
  const ring = legs.flatMap((leg, index) => (index === 0 ? leg : leg.slice(1)));
  return [ring];
}

function unreachedLabels(
  routes: readonly Route[],
  found: readonly { route: Route; cells: number[] | undefined }[],
): string[] {
  const reached = new Set(
    found.flatMap(({ route, cells }) =>
      cells === undefined ? [] : [route.from.label, route.to.label],
    ),
  );
  const wanted = new Set(routes.flatMap(({ from, to }) => [from.label, to.label]));
  return [...wanted].flatMap((label) => (label === undefined || reached.has(label) ? [] : [label]));
}

/**
 * Paths in the intent's style, routed by A* over the slope-weighted grid. Where the ground
 * allows, every step keeps within the running and cross slope limits, and entrances on ground
 * too steep for that move to the nearest cell of the compliant network.
 */
export function planPaths(input: PathPlanInput): PathPlan {
  const networks = networksFor(input);
  const entranceCells = input.entrances.flatMap((point) => listOf(entranceCell(networks, point)));
  const entrances = entranceCells
    .filter((cell, index) => entranceCells.indexOf(cell) === index)
    .map((cell) => ({ cell }));
  const targets = input.targets.flatMap(({ label, centre, areaM2 }) =>
    listOf(targetCell(networks, centre)).map((cell) => ({ cell, label, areaM2 })),
  );
  const routes = routesFor(input, entrances, targets);
  const found = routes.map((route) => ({
    route,
    cells: routeCells(networks, route.from.cell, route.to.cell),
  }));
  const legs = found.flatMap(({ cells }) => (cells === undefined ? [] : [cells]));
  const complete = input.style === 'loop' && legs.length === routes.length;
  const paths = (complete ? joinLoop(legs) : legs).flatMap((cells) => toPath(input, cells));
  return { paths, unreached: unreachedLabels(routes, found) };
}
