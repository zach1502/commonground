import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { computeMetrics } from '@parkshape/core';
import { buildSeedPlan, loadJonathanRogersSite } from '@parkshape/db/seed';

import { WorkerPoolMetricsRunner } from '../src/adapters/worker-pool-metrics-runner.js';
import { designSchema, projectSchema } from '../src/contracts/projects-designs.js';

import { KEVIN, BOB, MOLLY, SALLY, STAFF, startHarness, type Harness } from './harness.js';

const AUTHORS = [BOB, MOLLY, KEVIN, SALLY, 'persona-rose-evergreen'];
const SUBMITS_PER_AUTHOR = 5;
const OK = 200;
const LIVE_CAP_REACHED = 422;
// 25 measurements take about a second on four workers; a full parallel test run is slower.
const STORM_TIMEOUT_MS = 30_000;

// Counts the measurements that run on this thread. A worker thread loads its own copy of core,
// which this mock does not reach, so a call counted here is raster work on the request thread.
vi.mock('@parkshape/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@parkshape/core')>();
  return { ...core, computeMetrics: vi.fn(core.computeMetrics) };
});

let h: Harness;
const drafts: { readonly cookie: string; readonly id: string }[] = [];

/** A showcase design from the seed: about 100 ms of raster work per measurement. */
function heavyDocument(site: ReturnType<typeof loadJonathanRogersSite>) {
  const plan = buildSeedPlan(site, { generatedCount: 0 });
  const design = plan.designs.find((planned) => planned.key.includes('Dog run'));
  if (design === undefined) throw new Error('the showcase has no dog run design');
  return design.build().document;
}

async function makeDrafts(cookie: string, projectId: string, document: unknown) {
  for (let index = 0; index < SUBMITS_PER_AUTHOR; index += 1) {
    const created = await h.call('POST', `/projects/${projectId}/designs`, {
      cookie,
      body: { from: 'blank', title: 'Dog run' },
    });
    const { id } = designSchema.parse(created.body);
    await h.call('PUT', `/designs/${id}`, {
      cookie,
      body: { title: 'Dog run', blurb: 'A run on the north edge.', document },
    });
    drafts.push({ cookie, id });
  }
}

// Everything slow starts in the hook: pglite, the showcase layout and the project.
beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' }, { metrics: 'worker-pool' });
  const site = loadJonathanRogersSite();
  for (const blob of site.blobs) await h.deps.blobStore.put(blob.key, blob.bytes, blob.contentType);
  const staff = await h.login(STAFF);
  const created = await h.call('POST', '/projects', {
    cookie: staff,
    body: {
      name: 'Jonathan Rogers Park refresh',
      parameters: site.parameters,
      parcel: site.parcel,
      heightmapRef: site.heightmapRef,
    },
  });
  const project = projectSchema.parse(created.body);
  const document = heavyDocument(site);
  for (const author of AUTHORS) await makeDrafts(await h.login(author), project.id, document);
});

afterAll(async () => {
  await h.close();
});

describe('metrics off the request thread', () => {
  it('selects the worker pool when the harness asks for it', () => {
    expect(h.deps.metrics).toBeInstanceOf(WorkerPoolMetricsRunner);
  });

  it(
    'measures 25 parallel submits on worker threads and answers /health while they run',
    async () => {
      vi.mocked(computeMetrics).mockClear();
      const storm = { settled: false };
      const submits = Promise.all(
        drafts.map(({ cookie, id }) => h.call('POST', `/designs/${id}/submit`, { cookie })),
      ).finally(() => {
        storm.settled = true;
      });
      const health = await h.call('GET', '/health');
      const answeredDuringStorm = !storm.settled;
      const statuses = (await submits).map((answer) => answer.status);
      expect(health.status).toBe(OK);
      expect(answeredDuringStorm).toBe(true);
      expect(statuses.every((status) => status === OK || status === LIVE_CAP_REACHED)).toBe(true);
      expect(statuses).toContain(OK);
      expect(computeMetrics).not.toHaveBeenCalled();
    },
    STORM_TIMEOUT_MS,
  );
});
