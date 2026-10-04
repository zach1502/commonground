import {
  failedConstraints,
  type DesignDocument,
  type DocumentIssue,
  type MetricsReport,
  type Parcel,
  type ProjectParameters,
} from '@parkshape/core';

import { ApiError, metricsUnavailable, type HardFailure } from '../errors.js';
import type { MetricsOutcome, MetricsRunner } from '../ports/metrics-runner.js';

import type { HeightmapSource, ProjectTerrain } from './heightmap.js';

export interface SubmissionInput {
  readonly document: DesignDocument;
  /** The park as it is today, so an unchanged existing garden counts its recorded plots. */
  readonly baseline?: DesignDocument | undefined;
  readonly parameters: ProjectParameters;
  readonly parcel: Parcel;
  readonly terrain: ProjectTerrain;
}

/** The core report plus where its terrain came from, as stored on the design. */
export type SubmissionMetrics = MetricsReport & { readonly heightmapSource: HeightmapSource };

function issueOf(issue: DocumentIssue) {
  const path = 'elementId' in issue ? issue.elementId : 'heightmap';
  return { path, message: issue.kind };
}

function reportOf(outcome: MetricsOutcome) {
  switch (outcome.kind) {
    case 'measured':
      return outcome.report;
    case 'invalid':
      throw new ApiError('validation', 'The design cannot be measured.', {
        issues: outcome.issues.map(issueOf),
      });
    case 'timed-out':
      throw metricsUnavailable(`Measuring the design took over ${String(outcome.afterMs)} ms.`);
    case 'failed':
      // The worker's own reason names threads and exit codes, which mean nothing to a resident.
      throw metricsUnavailable('Measuring the design stopped part way.');
  }
}

/**
 * Server-authoritative metrics from core's computeMetrics, run by the given runner; the client
 * never sends them. A stored heightmap is keyed by its ref so each worker receives it once.
 */
export async function measureSubmission(
  runner: MetricsRunner,
  input: SubmissionInput,
): Promise<SubmissionMetrics> {
  const { document, baseline, parameters, parcel, terrain } = input;
  const outcome = await runner.measure({
    document,
    baseline,
    parameters,
    parcel,
    heightmap: terrain.heightmap,
    heightmapKey: terrain.key,
  });
  return { heightmapSource: terrain.source, ...reportOf(outcome) };
}

/** Each failed hard constraint with the report's message for it. */
export function hardFailuresOf(report: MetricsReport): HardFailure[] {
  return failedConstraints(report).map((key) => ({
    key,
    detail: report.constraints[key].message,
  }));
}
