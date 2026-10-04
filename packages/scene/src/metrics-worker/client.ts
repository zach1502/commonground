import { createDefaultWorker } from './default-worker.js';
import type { MetricsRequest, MetricsResult, WorkerLike } from './protocol.js';
import { runMetrics, toRequestMessage } from './run-metrics.js';

export type { WorkerLike } from './protocol.js';

export type MetricsListener = (result: MetricsResult) => void;

export interface MetricsClientOptions {
  readonly debounceMs: number;
  /** Builds the worker; defaults to the Vite worker, or the main-thread fallback when absent. */
  readonly createWorker?: () => WorkerLike | null;
  readonly schedule?: (task: () => void, ms: number) => number;
  readonly cancel?: (handle: number) => void;
}

export interface MetricsClient {
  /** Queues a run; only the last request within the debounce window is sent. */
  readonly compute: (request: MetricsRequest) => void;
  readonly subscribe: (listener: MetricsListener) => () => void;
  readonly dispose: () => void;
}

const defaultSchedule = (task: () => void, ms: number): number => window.setTimeout(task, ms);

const defaultCancel = (handle: number): void => {
  window.clearTimeout(handle);
};

/**
 * Debounces document changes, tags each run with an id, and delivers only the newest result so a
 * slow worker reply for an old document is dropped. Falls back to the main thread with no Worker.
 */
export function createMetricsClient(options: MetricsClientOptions): MetricsClient {
  const schedule = options.schedule ?? defaultSchedule;
  const cancel = options.cancel ?? defaultCancel;
  const listeners = new Set<MetricsListener>();
  const worker = (options.createWorker ?? createDefaultWorker)();
  let timer: number | null = null;
  let pending: MetricsRequest | null = null;
  let sentId = 0;
  let latestId = 0;

  const deliver = (result: MetricsResult, id: number): void => {
    if (id !== latestId) return;
    for (const listener of listeners) listener(result);
  };

  if (worker !== null) {
    worker.onmessage = (event) => {
      deliver(event.data.result, event.data.requestId);
    };
  }

  const send = (): void => {
    if (pending === null) return;
    const request = pending;
    pending = null;
    sentId += 1;
    latestId = sentId;
    const { message, transfer } = toRequestMessage(sentId, request);
    if (worker === null) {
      deliver(runMetrics(message, request.catalog), sentId);
      return;
    }
    worker.postMessage(message, transfer);
  };

  return {
    compute: (request) => {
      pending = request;
      if (timer !== null) cancel(timer);
      timer = schedule(() => {
        timer = null;
        send();
      }, options.debounceMs);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    dispose: () => {
      if (timer !== null) cancel(timer);
      listeners.clear();
      if (worker !== null) worker.terminate();
    },
  };
}
