import { EARTHWORKS_BIN_M3, EARTHWORKS_BIN_STEPS_M3 } from '../constants.js';

import type { InsightDesign } from './types.js';

export interface EarthworksBin {
  /** Inclusive lower edge, in cubic metres of net fill. */
  readonly fromM3: number;
  /** Exclusive upper edge. */
  readonly toM3: number;
  readonly count: number;
}

export interface EarthworksHistogram {
  readonly binM3: number;
  /** Every bin from the lowest to the highest used, empty ones included; at least 5. */
  readonly bins: readonly EarthworksBin[];
}

// A chart needs this many bins to show a spread. Steps are tried from the widest down.
const MIN_BINS = 5;
const HALF = 2;

function binCount(nets: readonly number[], step: number): number {
  return Math.floor(Math.max(...nets) / step) - Math.floor(Math.min(...nets) / step) + 1;
}

/** The widest step, from 50 m3 down to 1 m3, that spreads the data over at least 5 bins. */
function stepFor(nets: readonly number[]): number {
  return (
    Object.values(EARTHWORKS_BIN_STEPS_M3).find((step) => binCount(nets, step) >= MIN_BINS) ??
    EARTHWORKS_BIN_M3
  );
}

/**
 * Designs by net earthworks (fill minus cut). The step shrinks until the data spans 5 bins, and
 * when every design moves the same amount, empty bins pad both sides so the one full bar has
 * context instead of filling the chart.
 */
export function earthworksHistogram(designs: readonly InsightDesign[]): EarthworksHistogram {
  const nets = designs.flatMap((design) => (design.metrics === null ? [] : [design.metrics.netM3]));
  if (nets.length === 0) return { binM3: EARTHWORKS_BIN_M3, bins: [] };
  const step = stepFor(nets);
  const indexes = nets.map((net) => Math.floor(net / step));
  const used = Math.max(...indexes) - Math.min(...indexes) + 1;
  const padBelow = Math.floor(Math.max(0, MIN_BINS - used) / HALF);
  const lowest = Math.min(...indexes) - padBelow;
  const length = Math.max(used, MIN_BINS);
  const bins = Array.from({ length }, (_, offset) => {
    const index = lowest + offset;
    return {
      fromM3: index * step,
      toM3: (index + 1) * step,
      count: indexes.filter((found) => found === index).length,
    };
  });
  return { binM3: step, bins };
}
