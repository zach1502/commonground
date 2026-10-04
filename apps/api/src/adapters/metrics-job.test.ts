import { describe, expect, it } from 'vitest';

import { FIXTURE_JOB } from '../ports/__contracts__/metrics-runner.contract.js';

import {
  HeightmapSlots,
  WORKER_HEIGHTMAP_SLOTS,
  createWorkerHandler,
  type WorkerRequest,
} from './metrics-job.js';
import { metricsWorkerScript } from './metrics-worker-script.js';

describe('HeightmapSlots', () => {
  it('drops the oldest key once every slot is full', () => {
    const slots = new HeightmapSlots<number>();
    for (let index = 0; index <= WORKER_HEIGHTMAP_SLOTS; index += 1)
      slots.set(`k${String(index)}`, index);
    expect(slots.get('k0')).toBeUndefined();
    expect(slots.get(`k${String(WORKER_HEIGHTMAP_SLOTS)}`)).toBe(WORKER_HEIGHTMAP_SLOTS);
  });

  it('keeps a key that is set again as the newest', () => {
    const slots = new HeightmapSlots<number>();
    slots.set('first', 0);
    for (let index = 1; index < WORKER_HEIGHTMAP_SLOTS; index += 1)
      slots.set(`k${String(index)}`, index);
    slots.set('first', 0);
    slots.set('last', 1);
    expect(slots.get('first')).toBe(0);
    expect(slots.get('k1')).toBeUndefined();
  });
});

/** The fixture job as the pool sends it once the worker already holds its heightmap. */
function withoutHeightmap(): WorkerRequest['job'] {
  const { document, baseline, parameters, parcel, heightmapKey } = FIXTURE_JOB;
  return { document, baseline, parameters, parcel, heightmapKey };
}

describe('createWorkerHandler', () => {
  it('fails a job whose heightmap it was never sent', () => {
    expect(createWorkerHandler()({ id: 7, job: withoutHeightmap() }).outcome.kind).toBe('failed');
  });

  it('measures a later job from the heightmap kept under its key', () => {
    const handle = createWorkerHandler();
    const first = handle({ id: 1, job: FIXTURE_JOB });
    expect(handle({ id: 2, job: withoutHeightmap() })).toEqual({ id: 2, outcome: first.outcome });
  });
});

describe('metricsWorkerScript', () => {
  it('runs the built worker file beside built code', () => {
    const script = metricsWorkerScript('file:///app/dist/adapters/worker-pool-metrics-runner.js');
    expect(script).toEqual({
      kind: 'built',
      url: new URL('file:///app/dist/adapters/metrics-worker.js'),
    });
  });

  it('loads the source worker through tsx beside source code', () => {
    const script = metricsWorkerScript(import.meta.url.replace(/[^/]+$/, 'x.ts'));
    expect(script.kind).toBe('source');
    expect(script.url.pathname).toMatch(/src\/adapters\/metrics-worker\.ts$/);
  });
});
