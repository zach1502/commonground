import type { Grid } from '../metrics/raster.js';

import { boxCentreCell, boxSum, type CellBox } from './cell-box.js';
import type { CellSize } from './features.js';

export interface SearchInput {
  readonly grid: Grid;
  /** Summed-area table of cells a footprint may not cover. */
  readonly blocked: Float64Array;
  /** Summed-area table of cells too steep for this feature, when it has a grade limit. */
  readonly steep: Float64Array | undefined;
  readonly size: CellSize;
  /** Higher is better; called once per box that fits, in scan order. */
  rank(centreCell: number): number;
  spaced(box: CellBox): boolean;
}

function fits(input: SearchInput, box: CellBox): boolean {
  if (boxSum(input.blocked, input.grid, box) > 0) return false;
  if (input.steep !== undefined && boxSum(input.steep, input.grid, box) > 0) return false;
  return input.spaced(box);
}

/** The best-ranked box of the given size that fits, scanning rows from the south-west. */
export function bestBox(input: SearchInput): CellBox | undefined {
  const { grid, size } = input;
  let best: CellBox | undefined;
  let bestRank = -Infinity;
  for (let j0 = 0; j0 + size.rows <= grid.height; j0 += 1) {
    for (let i0 = 0; i0 + size.columns <= grid.width; i0 += 1) {
      const box = { i0, j0, columns: size.columns, rows: size.rows };
      const rank = fits(input, box) ? input.rank(boxCentreCell(grid, box)) : -Infinity;
      if (rank > bestRank) {
        best = box;
        bestRank = rank;
      }
    }
  }
  return best;
}
