import { afterAll, describe, expect, it } from 'vitest';

import { makeRampHeightmap } from '@parkshape/core';

import {
  FIXTURE_JOB,
  metricsRunnerContract,
} from '../ports/__contracts__/metrics-runner.contract.js';
import type { MetricsOutcome } from '../ports/metrics-runner.js';

import type { WorkerScript } from './metrics-worker-script.js';
import { WorkerPoolMetricsRunner, metricsPoolSize } from './worker-pool-metrics-runner.js';

// A stand-in worker: it waits the milliseconds named in heightmapKey, then answers with its thread.
const SLOW_WORKER_SOURCE = `
import { parentPort, threadId } from 'node:worker_threads';
parentPort.on('message', ({ id, job }) => {
  setTimeout(() => {
    parentPort.postMessage({ id, outcome: { kind: 'failed', message: 'thread ' + threadId } });
  }, Number(job.heightmapKey));
});`;
const SLOW_WORKER: WorkerScript = {
  kind: 'built',
  url: new URL(`data:text/javascript,${encodeURIComponent(SLOW_WORKER_SOURCE)}`),
};
// The second job waits one job's time in the queue, then outlives the caller's budget while it
// runs, but it runs for less than the budget, so its worker is not stuck.
const JOB_MS = 600;
const BUDGET_MS = 900;

function threadOf(outcome: MetricsOutcome): string {
  return outcome.kind === 'failed' ? outcome.message : outcome.kind;
}

metricsRunnerContract('WorkerPoolMetricsRunner', () => new WorkerPoolMetricsRunner({ size: 2 }));

describe('metricsPoolSize', () => {
  it('leaves one core for the thread that answers requests', () => {
    expect(metricsPoolSize(3)).toBe(2);
  });

  it('keeps at least one worker on a single core', () => {
    expect(metricsPoolSize(1)).toBe(1);
  });

  it('stops at four workers on a large machine', () => {
    expect(metricsPoolSize(64)).toBe(4);
  });
});

describe('WorkerPoolMetricsRunner', () => {
  const runners: WorkerPoolMetricsRunner[] = [];
  const pool = (options: ConstructorParameters<typeof WorkerPoolMetricsRunner>[0]) => {
    const made = new WorkerPoolMetricsRunner(options);
    runners.push(made);
    return made;
  };

  afterAll(async () => {
    await Promise.all(runners.map((made) => made.close()));
  });

  it('sends a heightmap to a worker once and reuses it for the same key', async () => {
    const single = pool({ size: 1 });
    const first = await single.measure(FIXTURE_JOB);
    const { width, height, resolutionM } = FIXTURE_JOB.heightmap;
    const steep = makeRampHeightmap({ width, height, resolutionM, gradeX: 0.5 });
    const cached = await single.measure({ ...FIXTURE_JOB, heightmap: steep });
    const fresh = await single.measure({ ...FIXTURE_JOB, heightmap: steep, heightmapKey: 'steep' });
    expect(JSON.stringify(cached)).toBe(JSON.stringify(first));
    expect(JSON.stringify(fresh)).not.toBe(JSON.stringify(first));
  });

  it('leaves the caller heightmap usable after sending it', async () => {
    const elevations = FIXTURE_JOB.heightmap.elevations;
    await pool({ size: 1 }).measure({ ...FIXTURE_JOB, heightmapKey: 'copy-check' });
    expect(elevations.length).toBe(FIXTURE_JOB.heightmap.width * FIXTURE_JOB.heightmap.height);
  });

  it('answers a typed timeout and replaces the stuck worker for the next job', async () => {
    const hasty = pool({ size: 1, timeoutMs: 1 });
    const [first, second] = await Promise.all([
      hasty.measure(FIXTURE_JOB),
      hasty.measure(FIXTURE_JOB),
    ]);
    expect(first).toEqual({ kind: 'timed-out', afterMs: 1 });
    expect(second).toEqual({ kind: 'timed-out', afterMs: 1 });
  });

  it('keeps a worker whose job spent most of the budget waiting in the queue', async () => {
    const slow = pool({ size: 1, timeoutMs: BUDGET_MS, script: SLOW_WORKER });
    const job = { ...FIXTURE_JOB, heightmapKey: String(JOB_MS) };
    const [first, queued] = await Promise.all([slow.measure(job), slow.measure(job)]);
    expect(queued).toEqual({ kind: 'timed-out', afterMs: BUDGET_MS });
    const next = await slow.measure({ ...job, heightmapKey: '1' });
    expect(threadOf(next)).toBe(threadOf(first));
    expect(threadOf(first)).toMatch(/^thread \d+$/);
  });

  it('fails jobs sent after close', async () => {
    const closed = pool({ size: 1 });
    await closed.close();
    expect((await closed.measure(FIXTURE_JOB)).kind).toBe('failed');
  });
});
