import { catalogIndex, computeMetrics, type Heightmap } from '@parkshape/core';

import type { MetricsJob, MetricsOutcome } from '../ports/metrics-runner.js';

/** Measures one job on the calling thread; both runners end here. */
export function runMetricsJob(job: MetricsJob): MetricsOutcome {
  const { document, baseline, parameters, parcel, heightmap } = job;
  const result = computeMetrics({
    document,
    baseline,
    parameters,
    parcel,
    heightmap,
    catalog: catalogIndex,
  });
  return result.ok
    ? { kind: 'measured', report: result.value }
    : { kind: 'invalid', issues: result.error.issues };
}

/** Heightmaps a worker keeps; one per project in practice, so a few are plenty. */
export const WORKER_HEIGHTMAP_SLOTS = 8;

/**
 * Keys in the order they were added, dropping the oldest past the slot count. The pool keeps one
 * per worker beside the worker's own cache, and both see the same keys in the same order, so the
 * pool knows which heightmaps a worker already holds without asking.
 */
export class HeightmapSlots<T> {
  private readonly entries = new Map<string, T>();

  get(key: string): T | undefined {
    return this.entries.get(key);
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    const [oldest] = this.entries.keys();
    if (this.entries.size > WORKER_HEIGHTMAP_SLOTS && oldest !== undefined) {
      this.entries.delete(oldest);
    }
  }
}

/** A job as sent to a worker: the heightmap rides along only when the worker lacks it. */
export interface WorkerRequest {
  readonly id: number;
  readonly job: Omit<MetricsJob, 'heightmap'> & { readonly heightmap?: Heightmap };
}

export interface WorkerReply {
  readonly id: number;
  readonly outcome: MetricsOutcome;
}

/** The worker side: keeps each keyed heightmap it is sent and measures with it. */
export function createWorkerHandler(): (request: WorkerRequest) => WorkerReply {
  const heightmaps = new HeightmapSlots<Heightmap>();
  return ({ id, job }) => {
    const { heightmapKey } = job;
    if (job.heightmap !== undefined && heightmapKey !== undefined) {
      heightmaps.set(heightmapKey, job.heightmap);
    }
    const heightmap =
      job.heightmap ?? (heightmapKey === undefined ? undefined : heightmaps.get(heightmapKey));
    if (heightmap === undefined) {
      return {
        id,
        outcome: { kind: 'failed', message: 'The worker has no heightmap for this job.' },
      };
    }
    return { id, outcome: runMetricsJob({ ...job, heightmap }) };
  };
}
