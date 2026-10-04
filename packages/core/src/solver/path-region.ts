import { neighboursOf, type CostGrid } from './astar.js';
import { readAt } from './read-at.js';

/** The cells reachable from one start by allowed A* steps, cleared from `unvisited` as found. */
function reachableFrom(costs: CostGrid, unvisited: Uint8Array, start: number): number[] {
  const region = [start];
  unvisited[start] = 0;
  for (let next = 0; next < region.length; next += 1) {
    neighboursOf(costs, readAt(region, next, start)).forEach((neighbour) => {
      if (unvisited[neighbour] !== 1) return;
      unvisited[neighbour] = 0;
      region.push(neighbour);
    });
  }
  return region;
}

/**
 * The largest set of passable cells joined by steps A* may take. Steps are symmetric, so any two
 * cells in the set have a route between them. Entrances snap into this set, so a loop never
 * starts in a cut-off pocket.
 */
export function mainRegion(costs: CostGrid): Uint8Array {
  const unvisited = Uint8Array.from(costs.cost, (cost) => (cost === Infinity ? 0 : 1));
  let largest: number[] = [];
  unvisited.forEach((cell, index) => {
    if (cell !== 1) return;
    const region = reachableFrom(costs, unvisited, index);
    if (region.length > largest.length) largest = region;
  });
  const main = new Uint8Array(costs.cost.length);
  largest.forEach((cell) => {
    main[cell] = 1;
  });
  return main;
}

export function regionSize(region: Uint8Array): number {
  return region.reduce((total, cell) => total + cell, 0);
}
