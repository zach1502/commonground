import type {
  DesignDocument,
  DocumentIssue,
  Heightmap,
  MetricsReport,
  Parcel,
  ProjectParameters,
} from '@parkshape/core';

/** One design to measure with core's computeMetrics; the catalog is the runner's own. */
export interface MetricsJob {
  readonly document: DesignDocument;
  readonly baseline?: DesignDocument | undefined;
  readonly parameters: ProjectParameters;
  readonly parcel: Parcel;
  readonly heightmap: Heightmap;
  /**
   * Names the heightmap's contents, such as the project's heightmapRef, so a runner may keep it
   * between jobs. Two jobs with one key must carry the same heightmap. Undefined never caches.
   */
  readonly heightmapKey?: string | undefined;
}

/** What a measurement produced; a runner never throws for these. */
export type MetricsOutcome =
  | { readonly kind: 'measured'; readonly report: MetricsReport }
  | { readonly kind: 'invalid'; readonly issues: readonly DocumentIssue[] }
  | { readonly kind: 'timed-out'; readonly afterMs: number }
  | { readonly kind: 'failed'; readonly message: string };

/**
 * Runs computeMetrics for the API. The raster work takes about 100 ms for a full design, so the
 * hosted runner keeps it off the thread that answers requests.
 */
export interface MetricsRunner {
  measure(job: MetricsJob): Promise<MetricsOutcome>;
  /** Stops any threads the runner started; later jobs fail. */
  close(): Promise<void>;
}
