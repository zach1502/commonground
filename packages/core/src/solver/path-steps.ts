import { withinSlopeLimits, type SlopeLimits } from '../metrics/slopes.js';

import { stepOffsets } from './astar.js';
import { pointOf, type Site } from './site.js';

export interface StepCheck {
  readonly widthM: number;
  readonly limits: SlopeLimits;
}

/**
 * For each cell, the A* step mask of the steps whose straight line from centre to centre keeps a
 * path of this width within the running and cross slope limits. Each step is sampled the way the
 * path check samples a path, so a route made only of allowed steps passes that check.
 */
export function slopeSteps(site: Site, check: StepCheck): Uint8Array {
  const { grid, heightmap } = site;
  const offsets = stepOffsets();
  const steps = new Uint8Array(grid.width * grid.height);
  steps.forEach((_, index) => {
    const i = index % grid.width;
    const j = Math.floor(index / grid.width);
    const from = pointOf(grid, index);
    steps[index] = offsets.reduce((mask, { di, dj }, bit) => {
      const ni = i + di;
      const nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= grid.width || nj >= grid.height) return mask;
      const to = pointOf(grid, nj * grid.width + ni);
      const line = { points: [from, to], widthM: check.widthM };
      return withinSlopeLimits(heightmap, line, check.limits) ? mask | (1 << bit) : mask;
    }, 0);
  });
  return steps;
}
