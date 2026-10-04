import type { MetricsJob, MetricsOutcome, MetricsRunner } from '../ports/metrics-runner.js';

import { runMetricsJob } from './metrics-job.js';

/** Measures on the calling thread, as the API always did; for tests and one-off tools. */
export class InlineMetricsRunner implements MetricsRunner {
  measure(job: MetricsJob): Promise<MetricsOutcome> {
    return Promise.resolve(runMetricsJob(job));
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}
