import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  metricsWorkerScript,
  type WorkerScript,
} from '../../src/adapters/metrics-worker-script.js';
import {
  METRICS_TIMEOUT_MS,
  WorkerPoolMetricsRunner,
  type StartTimer,
} from '../../src/adapters/worker-pool-metrics-runner.js';
import { createApp } from '../../src/app.js';
import { submitResultSchema } from '../../src/contracts/projects-designs.js';
import type { ApiApp } from '../../src/deps.js';
import { FIXTURE_JOB } from '../../src/ports/__contracts__/metrics-runner.contract.js';
import type { MetricsJob, MetricsOutcome, MetricsRunner } from '../../src/ports/metrics-runner.js';
import { GARDEN, createDraft, createProject } from '../fixtures.js';
import { BOB, STAFF, errorKind, startHarness, type Harness } from '../harness.js';

// The budget the pool reports. No real timer runs for it: the tests fire the pool's timers by hand,
// so a slow worker start under tsx on a loaded machine cannot run a job out of time.
const SHORT_TIMEOUT_MS = 3000;
const FAULT_TEST_TIMEOUT_MS = 20_000;
// measure() starts the caller's budget timer, then the stuck-worker timer when it dispatches.
const TIMERS_PER_DISPATCHED_JOB = 2;
const TEN_SECONDS_MS = 10_000;
const OK = 200;
const UNAVAILABLE = 503;

function faultyScript(): WorkerScript {
  const real = metricsWorkerScript();
  if (real.kind !== 'source') throw new Error('the recovery tests run from source');
  return { ...real, url: new URL('./faulty-metrics-worker.ts', import.meta.url) };
}

/** The pool's timers, held until a test fires them. A timer nobody fires never runs out. */
class ManualTimers {
  readonly delays: number[] = [];
  private readonly live = new Set<() => void>();
  private waiters: { count: number; wake: () => void }[] = [];

  readonly start: StartTimer = (ms, callback) => {
    this.delays.push(ms);
    this.live.add(callback);
    this.waiters = this.waiters.filter(({ count, wake }) => {
      if (this.delays.length < count) return true;
      wake();
      return false;
    });
    return () => {
      this.live.delete(callback);
    };
  };

  /** Resolves once the pool has started this many timers in all. */
  started(count: number): Promise<void> {
    if (this.delays.length >= count) return Promise.resolve();
    return new Promise((wake) => this.waiters.push({ count, wake }));
  }

  /** Runs every timer still live, as if the whole budget had passed. */
  fireAll(): void {
    const due = [...this.live];
    this.live.clear();
    for (const callback of due) callback();
  }
}

const runners: WorkerPoolMetricsRunner[] = [];
function singleWorkerPool(timers = new ManualTimers()): WorkerPoolMetricsRunner {
  const runner = new WorkerPoolMetricsRunner({
    size: 1,
    timeoutMs: SHORT_TIMEOUT_MS,
    script: faultyScript(),
    startTimer: timers.start,
  });
  runners.push(runner);
  return runner;
}

afterAll(async () => {
  await Promise.all(runners.map((runner) => runner.close()));
});

describe('a metrics worker that fails mid-job', () => {
  it.each([
    ['throws', 'fault:throw', /failed/],
    ['exits', 'fault:exit', /stopped with code 1/],
  ])(
    'answers the pending job with a typed failure when the worker %s, then a new worker measures',
    async (_label, fault, message) => {
      const pool = singleWorkerPool();
      const failed = await pool.measure({ ...FIXTURE_JOB, heightmapKey: fault });
      expect(failed.kind).toBe('failed');
      expect(failed.kind === 'failed' ? failed.message : '').toMatch(message);
      expect((await pool.measure(FIXTURE_JOB)).kind).toBe('measured');
    },
    FAULT_TEST_TIMEOUT_MS,
  );

  it(
    'keeps jobs queued behind a crashed one and measures them on the new worker',
    async () => {
      const pool = singleWorkerPool();
      const [crashed, queued] = await Promise.all([
        pool.measure({ ...FIXTURE_JOB, heightmapKey: 'fault:exit' }),
        pool.measure(FIXTURE_JOB),
      ]);
      expect(crashed.kind).toBe('failed');
      expect(queued.kind).toBe('measured');
    },
    FAULT_TEST_TIMEOUT_MS,
  );

  it(
    'times out a job that never returns and recycles the stuck worker',
    async () => {
      const timers = new ManualTimers();
      const pool = singleWorkerPool(timers);
      const pending = pool.measure({ ...FIXTURE_JOB, heightmapKey: 'fault:hang' });
      await timers.started(TIMERS_PER_DISPATCHED_JOB);
      expect(timers.delays).toEqual([SHORT_TIMEOUT_MS, SHORT_TIMEOUT_MS]);
      timers.fireAll();
      expect(await pending).toEqual({ kind: 'timed-out', afterMs: SHORT_TIMEOUT_MS });
      // The only worker is spinning, so an answer here comes from its replacement.
      expect((await pool.measure(FIXTURE_JOB)).kind).toBe('measured');
    },
    FAULT_TEST_TIMEOUT_MS,
  );

  it('gives up on a job after 10 s by default', () => {
    expect(METRICS_TIMEOUT_MS).toBe(TEN_SECONDS_MS);
  });
});

/** Forwards to the faulty pool, sending the first job the fault it names and later jobs as they are. */
class FaultOnce implements MetricsRunner {
  constructor(
    private readonly pool: WorkerPoolMetricsRunner,
    private fault: string | undefined,
  ) {}

  measure(job: MetricsJob): Promise<MetricsOutcome> {
    const heightmapKey = this.fault ?? job.heightmapKey;
    this.fault = undefined;
    return this.pool.measure({ ...job, heightmapKey });
  }

  close(): Promise<void> {
    return this.pool.close();
  }
}

describe('a submit whose metrics worker fails', () => {
  let h: Harness;
  let staff: string;
  let bob: string;

  beforeAll(async () => {
    h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' });
    staff = await h.login(STAFF);
    bob = await h.login(BOB);
  });

  afterAll(async () => {
    await h.close();
  });

  async function submitWith(app: ApiApp) {
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    await h.call('PUT', `/designs/${draft.id}`, {
      cookie: bob,
      body: { title: 'Beds', blurb: 'By the lane.', document: GARDEN },
    });
    const submit = () =>
      app.request(`/designs/${draft.id}/submit`, { method: 'POST', headers: { Cookie: bob } });
    return { submit };
  }

  it.each(['fault:exit', 'fault:hang'])(
    'answers 503 metricsUnavailable with Retry-After for %s, and the retry submits',
    async (fault) => {
      const timers = new ManualTimers();
      const runner = new FaultOnce(singleWorkerPool(timers), fault);
      const { submit } = await submitWith(createApp({ ...h.deps, metrics: runner }));
      const refusal = submit();
      if (fault === 'fault:hang') {
        await timers.started(TIMERS_PER_DISPATCHED_JOB);
        timers.fireAll();
      }
      const refused = await refusal;
      expect(refused.status).toBe(UNAVAILABLE);
      expect(refused.headers.get('Retry-After')).toMatch(/^\d+$/);
      expect(errorKind(await refused.json())).toBe('metricsUnavailable');
      const retried = await submit();
      expect(retried.status).toBe(OK);
      expect(submitResultSchema.parse(await retried.json()).status).toBe('submitted');
    },
    FAULT_TEST_TIMEOUT_MS,
  );
});
