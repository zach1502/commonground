import { describe, expect, it, vi } from 'vitest';

import { catalogIndex } from '@parkshape/core';

import { createMetricsClient, type WorkerLike } from './client.js';
import { requestFixture } from './metrics-fixtures.js';
import type { MetricsRequestMessage, MetricsResult } from './protocol.js';
import { runMetrics, toRequestMessage } from './run-metrics.js';

function manualScheduler() {
  const tasks = new Map<number, () => void>();
  let id = 0;
  return {
    schedule: (task: () => void) => {
      id += 1;
      tasks.set(id, task);
      return id;
    },
    cancel: (handle: number) => {
      tasks.delete(handle);
    },
    runAll: () => {
      const pending = [...tasks.values()];
      tasks.clear();
      for (const task of pending) task();
    },
  };
}

class SyncWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  posts = 0;
  terminated = false;
  postMessage(message: MetricsRequestMessage): void {
    this.posts += 1;
    this.onmessage?.({
      data: { requestId: message.requestId, result: runMetrics(message, catalogIndex) },
    });
  }
  terminate(): void {
    this.terminated = true;
  }
}

class DeferredWorker implements WorkerLike {
  onmessage: WorkerLike['onmessage'] = null;
  private posted: MetricsRequestMessage[] = [];
  postMessage(message: MetricsRequestMessage): void {
    this.posted.push(message);
  }
  terminate(): void {
    // no-op
  }
  respond(): void {
    const messages = this.posted;
    this.posted = [];
    for (const message of messages) {
      this.onmessage?.({
        data: { requestId: message.requestId, result: runMetrics(message, catalogIndex) },
      });
    }
  }
}

describe('createMetricsClient debounce', () => {
  it('sends only the last request queued within the window', () => {
    const scheduler = manualScheduler();
    const worker = new SyncWorker();
    const client = createMetricsClient({
      debounceMs: 150,
      createWorker: () => worker,
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    const listener = vi.fn();
    client.subscribe(listener);
    client.compute(requestFixture(0));
    client.compute(requestFixture(40));
    scheduler.runAll();
    expect(worker.posts).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('createMetricsClient stale-drop', () => {
  it('drops a reply once a newer request has gone out', () => {
    const scheduler = manualScheduler();
    const worker = new DeferredWorker();
    const client = createMetricsClient({
      debounceMs: 150,
      createWorker: () => worker,
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    const results: MetricsResult[] = [];
    client.subscribe((result) => results.push(result));
    client.compute(requestFixture(0));
    scheduler.runAll();
    client.compute(requestFixture(40));
    scheduler.runAll();
    worker.respond();
    expect(results).toHaveLength(1);
    const [only] = results;
    expect(only?.ok).toBe(true);
    const later = runMetrics(toRequestMessage(0, requestFixture(40)).message, catalogIndex);
    if (only?.ok && later.ok) {
      expect(only.value.totals.canopyPercent).toBe(later.value.totals.canopyPercent);
    }
  });
});

describe('createMetricsClient fallback', () => {
  it('runs on the main thread when no worker is available', () => {
    const scheduler = manualScheduler();
    const client = createMetricsClient({
      debounceMs: 150,
      createWorker: () => null,
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    const listener = vi.fn();
    const unsubscribe = client.subscribe(listener);
    client.compute(requestFixture(0));
    scheduler.runAll();
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    client.compute(requestFixture(0));
    scheduler.runAll();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('falls back with no createWorker, since Web Workers are absent in the test runtime', () => {
    const scheduler = manualScheduler();
    const client = createMetricsClient({
      debounceMs: 150,
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    const listener = vi.fn();
    client.subscribe(listener);
    client.compute(requestFixture(0));
    scheduler.runAll();
    expect(listener).toHaveBeenCalledTimes(1);
    client.dispose();
  });
});

describe('createMetricsClient dispose', () => {
  it('cancels a pending run and terminates the worker', () => {
    const scheduler = manualScheduler();
    const worker = new SyncWorker();
    const client = createMetricsClient({
      debounceMs: 150,
      createWorker: () => worker,
      schedule: scheduler.schedule,
      cancel: scheduler.cancel,
    });
    const listener = vi.fn();
    client.subscribe(listener);
    client.compute(requestFixture(0));
    client.dispose();
    scheduler.runAll();
    expect(listener).not.toHaveBeenCalled();
    expect(worker.terminated).toBe(true);
  });
});
