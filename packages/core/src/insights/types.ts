import type { CatalogIndex } from '../catalog/catalog.js';
import type { Grid } from '../metrics/raster.js';
import type { ConstraintStatus } from '../metrics/report.js';
import type { DesignDocument } from '../schema/design.js';
import type { ConstraintKey } from '../schema/parameters.js';
import type { SelfReport } from '../schema/self-report.js';
import type { VoteReason, VoteValue } from '../schema/vote.js';

/** The parts of a stored metrics report that insights read. */
export interface InsightMetrics {
  readonly constraints: Partial<Readonly<Record<ConstraintKey, ConstraintStatus>>>;
  /** Fill minus cut, in cubic metres. */
  readonly netM3: number;
}

/** A submitted design as insights see it. */
export interface InsightDesign {
  readonly id: string;
  readonly title: string;
  readonly authorId: string;
  readonly document: DesignDocument;
  /** Null when the design was stored without metrics. */
  readonly metrics: InsightMetrics | null;
  readonly up: number;
  readonly down: number;
}

export interface InsightVote {
  readonly designId: string;
  readonly userId: string;
  readonly value: VoteValue;
  readonly reasons: readonly VoteReason[];
}

/** Someone who voted or submitted, with the answers they chose to give. */
export interface Participant {
  readonly userId: string;
  readonly selfReport: SelfReport | null;
}

export interface InsightsInput {
  /** Submitted designs only. */
  readonly designs: readonly InsightDesign[];
  /** Every vote in the project. */
  readonly votes: readonly InsightVote[];
  readonly participants: readonly Participant[];
  /** The project's baseline document, or null when there is none. */
  readonly baseline: DesignDocument | null;
  readonly catalog: CatalogIndex;
  /** The grid heatmaps are summed on; grade cells index into it. */
  readonly grid: Grid;
}
