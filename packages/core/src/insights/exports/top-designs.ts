import type { CatalogIndex } from '../../catalog/catalog.js';
import type { Parcel } from '../../schema/parcel.js';
import type { InsightDesign } from '../types.js';

/** A design with its leaderboard place. */
export interface RankedInsightDesign {
  readonly rank: number;
  readonly score: number;
  readonly design: InsightDesign;
}

export interface ExportInput {
  /** The top designs, best first. */
  readonly designs: readonly RankedInsightDesign[];
  readonly catalog: CatalogIndex;
  readonly parcel: Parcel;
}

/** Collects the chunks an export writes, for tests and small responses. */
export function joinChunks(chunks: Iterable<string>): string {
  return [...chunks].join('');
}
