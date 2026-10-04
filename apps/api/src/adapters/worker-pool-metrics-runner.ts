import { availableParallelism } from 'node:os';
import type { Worker } from 'node:worker_threads';

import type { MetricsJob, MetricsOutcome, MetricsRunner } from '../ports/metrics-runner.js';

import { HeightmapSlots, type WorkerReply, type WorkerRequest } from './metrics-job.js';
import { metricsWorkerScript, startWorker, type WorkerScript } from './metrics-worker-script.js';

const MAX_WORKERS = 4;
/**
 * A job that has not finished this long after it was asked for gives up with a typed timeout. A
 * worker is only stopped once one job has run on it this long, so queue time never counts.
 */
export const METRICS_TIMEOUT_MS = 10_000;

/** One core stays with the thread that answers requests; at least one worker, at most four. */
export function metricsPoolSize(cores: number): number {
  return Math.min(MAX_WORKERS, Math.max(1, cores - 1));
}

/** Starts a timer and returns the function that cancels it. */
export type StartTimer = (ms: number, callback: () => void) => () => void;

const startRealTimer: StartTimer = (ms, callback) => {
  const timer = setTimeout(callback, ms);
  return () => {
    clearTimeout(timer);
  };
};

export interface WorkerPoolOptions {
  /** Worker threads; defaults to metricsPoolSize of the cores this process may use. */
  readonly size?: number;
  readonly timeoutMs?: number;
  readonly script?: WorkerScript;
  /** Starts the budget timers; tests pass one they fire by hand, so wall time cannot race them. */
  readonly startTimer?: StartTimer;
}

interface Pending {
  readonly id: number;
  readonly job: MetricsJob;
  readonly resolve: (outcome: MetricsOutcome) => void;
  readonly cancelTimer: () => void;
}

interface Slot {
  readonly worker: Worker;
  readonly sent: HeightmapSlots<true>;
  busy: Pending | undefined;
  /** Cancels the timer that stops the worker when its current job has run the whole budget. */
  cancelStuck: (() => void) | undefined;
}

const closedOutcome: MetricsOutcome = { kind: 'failed', message: 'The metrics runner is closed.' };

/**
 * Runs computeMetrics on a few worker threads so the request thread stays free. Jobs wait in
 * one queue when every worker is busy. A worker is started on first need and kept; one that
 * times out is stopped and replaced, since its job may never end.
 */
export class WorkerPoolMetricsRunner implements MetricsRunner {
  private readonly size: number;
  private readonly timeoutMs: number;
  private readonly script: WorkerScript;
  private readonly startTimer: StartTimer;
  private readonly slots: Slot[] = [];
  private readonly queue: Pending[] = [];
  private nextId = 0;
  private closed = false;

  constructor(options: WorkerPoolOptions = {}) {
    this.size = options.size ?? metricsPoolSize(availableParallelism());
    this.timeoutMs = options.timeoutMs ?? METRICS_TIMEOUT_MS;
    this.script = options.script ?? metricsWorkerScript();
    this.startTimer = options.startTimer ?? startRealTimer;
  }

  measure(job: MetricsJob): Promise<MetricsOutcome> {
    if (this.closed) return Promise.resolve(closedOutcome);
    return new Promise((resolve) => {
      this.nextId += 1;
      const pending: Pending = {
        id: this.nextId,
        job,
        resolve,
        cancelTimer: this.startTimer(this.timeoutMs, () => {
          this.expire(pending);
        }),
      };
      this.queue.push(pending);
      this.pump();
    });
  }

  async close(): Promise<void> {
    this.closed = true;
    for (const pending of this.queue.splice(0)) this.finish(pending, closedOutcome);
    const slots = this.slots.splice(0);
    for (const slot of slots) {
      if (slot.busy !== undefined) this.finish(slot.busy, closedOutcome);
    }
    await Promise.all(slots.map((slot) => slot.worker.terminate()));
  }

  private pump(): void {
    while (this.queue.length > 0) {
      const slot = this.idleSlot();
      const pending = slot === undefined ? undefined : this.queue.shift();
      if (slot === undefined || pending === undefined) return;
      this.dispatch(slot, pending);
    }
  }

  private idleSlot(): Slot | undefined {
    const idle = this.slots.find((slot) => slot.busy === undefined);
    if (idle !== undefined || this.slots.length >= this.size) return idle;
    return this.spawn();
  }

  private spawn(): Slot {
    const worker = startWorker(this.script);
    const slot: Slot = {
      worker,
      sent: new HeightmapSlots<true>(),
      busy: undefined,
      cancelStuck: undefined,
    };
    worker.unref();
    worker.on('message', (reply: WorkerReply) => {
      this.settle(slot, reply);
    });
    worker.on('error', (error) => {
      this.lose(slot, `The metrics worker failed: ${error.message}`);
    });
    worker.on('exit', (code) => {
      this.lose(slot, `The metrics worker stopped with code ${String(code)}.`);
    });
    this.slots.push(slot);
    return slot;
  }

  /** Sends the job, with a copy of its heightmap unless this worker already holds that key. */
  private dispatch(slot: Slot, pending: Pending): void {
    slot.busy = pending;
    slot.cancelStuck = this.startTimer(this.timeoutMs, () => {
      this.unstick(slot);
    });
    // A busy worker keeps the process alive until it answers; an idle one does not.
    slot.worker.ref();
    const { heightmap, ...job } = pending.job;
    const key = job.heightmapKey;
    if (key !== undefined && slot.sent.get(key) !== undefined) {
      const request: WorkerRequest = { id: pending.id, job };
      slot.worker.postMessage(request);
      return;
    }
    if (key !== undefined) slot.sent.set(key, true);
    const elevations = heightmap.elevations.slice();
    const request: WorkerRequest = {
      id: pending.id,
      job: { ...job, heightmap: { ...heightmap, elevations } },
    };
    slot.worker.postMessage(request, [elevations.buffer]);
  }

  private settle(slot: Slot, reply: WorkerReply): void {
    const pending = slot.busy;
    if (pending?.id !== reply.id) return;
    slot.cancelStuck?.();
    slot.busy = undefined;
    slot.worker.unref();
    this.finish(pending, reply.outcome);
    this.pump();
  }

  /**
   * The caller's budget ran out. A queued job leaves the queue; a running one keeps its worker,
   * which answers into a promise that has already settled unless it runs long enough to be stuck.
   */
  private expire(pending: Pending): void {
    const queued = this.queue.indexOf(pending);
    if (queued >= 0) this.queue.splice(queued, 1);
    pending.resolve({ kind: 'timed-out', afterMs: this.timeoutMs });
  }

  /** One job ran the whole budget on this worker, so it may never end: replace the worker. */
  private unstick(slot: Slot): void {
    const pending = this.retire(slot);
    if (pending !== undefined) this.finish(pending, { kind: 'timed-out', afterMs: this.timeoutMs });
    this.pump();
  }

  /** A worker that died answers its job with the reason, and a new one starts on next need. */
  private lose(slot: Slot, message: string): void {
    if (!this.slots.includes(slot)) return;
    const pending = this.retire(slot);
    if (pending !== undefined) this.finish(pending, { kind: 'failed', message });
    this.pump();
  }

  /** Stops the worker and returns the job it held, so a late reply cannot free a dead slot. */
  private retire(slot: Slot): Pending | undefined {
    const pending = slot.busy;
    slot.busy = undefined;
    slot.cancelStuck?.();
    this.slots.splice(this.slots.indexOf(slot), 1);
    void slot.worker.terminate();
    return pending;
  }

  private finish(pending: Pending, outcome: MetricsOutcome): void {
    pending.cancelTimer();
    pending.resolve(outcome);
  }
}
