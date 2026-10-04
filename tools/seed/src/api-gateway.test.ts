import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createApp, createApiContainer, type ApiContainer } from '@parkshape/api';
import { loadConfig } from '@parkshape/config';
import { designDocumentSchema, FakeClock } from '@parkshape/core';
import {
  buildSeedPlan,
  loadJonathanRogersSite,
  runSeed,
  TOP_COUNT,
  type SeedSummary,
  type ThumbnailStep,
} from '@parkshape/db/seed';

import { ApiSeedGateway } from './api-gateway.js';

// A 1x1 WebP stands in for the browser render, which runs only in the Playwright step.
const WEBP_1X1 = Buffer.from('UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==', 'base64');
// Machine-made names: a persona id, a slug with a counter, or a title that is only an id.
const SLUG_LIKE = /persona-|[a-z]+-[a-z]+-\d|^Design \S+$/;
const GENERATED_IN_TEST = 3;
const SEED_TIMEOUT_MS = 300_000;

const plan = buildSeedPlan(loadJonathanRogersSite(), {
  generatedCount: GENERATED_IN_TEST,
});

/** A fresh API on in-memory pglite, seeded twice through its own routes. */
async function seedTwice() {
  const clock = new FakeClock(new Date('2026-09-25T09:00:00Z'));
  const config = loadConfig({ DATABASE_URL: 'pglite://memory' });
  const container = await createApiContainer(config, {
    clock,
    authSecret: 'seed-gateway-test-secret-of-32-characters',
  });
  const gateway = new ApiSeedGateway({ app: createApp(container.deps), deps: container.deps });
  const thumbnails: ThumbnailStep = {
    render: async (_site, jobs) => {
      for (const job of jobs) await gateway.saveThumbnail(job.design.id, job.author, WEBP_1X1);
      return { mode: 'poster', rendered: jobs.length };
    },
  };
  const options = { plan, gateway, thumbnails, clock };
  const first = await runSeed(options);
  const second = await runSeed(options);
  return { container, gateway, first, second };
}

/** Project names and design titles as the public project list and leaderboard show them. */
async function publicNames(gateway: ApiSeedGateway, projectId: string) {
  const list = (await gateway.call({ method: 'GET', path: '/projects' })) as {
    projects: { name: string }[];
  };
  const board = (await gateway.call({
    method: 'GET',
    path: `/projects/${projectId}/leaderboard`,
  })) as { entries: { design: { title: string } }[] };
  return {
    projects: list.projects.map(({ name }) => name),
    titles: board.entries.map(({ design }) => design.title),
  };
}

/** The comment counts of both runs, the stored rows and how many designs they are on. */
async function seededComments(container: ApiContainer, runs: readonly SeedSummary[]) {
  const projectId = runs[0]?.projectId ?? '';
  const stored = await container.deps.repos.elementComments.listByProject(projectId, {
    hidden: 'include',
  });
  const designs = new Set(stored.map(({ designId }) => designId)).size;
  return [...runs.map(({ comments }) => comments), stored.length, designs];
}

// One seeded database, twice over, for every test below that reads it.
let container: ApiContainer;
let gateway: ApiSeedGateway;
let first: SeedSummary;
let second: SeedSummary;

beforeAll(async () => {
  ({ container, gateway, first, second } = await seedTwice());
}, SEED_TIMEOUT_MS);

afterAll(async () => {
  await container.close();
});

describe('seeding a fresh pglite database through the API', () => {
  it('creates every design, vote, self report and comment once, then changes nothing', async () => {
    expect(await seededComments(container, [first, second])).toEqual([6, 6, 6, 2]);
    expect(first.counts).toEqual({
      designs: plan.designs.length,
      votes: plan.votes.length,
      voters: new Set(plan.votes.map(({ voterId }) => voterId)).size,
      selfReports: plan.selfReports.length,
    });
    expect(second.counts).toEqual(first.counts);
    expect(second.createdDesigns).toBe(0);
    expect(second.thumbnails.mode).toBe('skipped');
  });

  it('builds the Jonathan Rogers project with its heightmap and locked baseline', async () => {
    const project = (await gateway.call({
      method: 'GET',
      path: `/projects/${first.projectId}`,
    })) as { name: string; baselineDesignId: string | null; closesAt: string | null };
    expect(project.name).toBe('Jonathan Rogers Park');
    expect(project.closesAt).toBe('2026-10-31');
    const header = await container.deps.blobStore.get('terrain/jonathan-rogers.json');
    expect(header?.contentType).toBe('application/json');
    const baseline = await container.deps.repos.designs.findById(project.baselineDesignId ?? '');
    const items = (baseline?.document.items ?? []) as { locked: boolean; catalogId: string }[];
    expect(items.some((item) => item.catalogId === 'washroom-building' && item.locked)).toBe(true);
    expect(baseline?.thumbnailRef).toMatch(/\.webp$/);
  });
});

describe('what the seeded database holds', () => {
  it('reads the site context once, so the API keeps a copy for the 3D views', async () => {
    const features = await gateway.warmContext(first.projectId);
    expect(features).toBeGreaterThan(0);
    const stored = await container.deps.blobStore.get(`context/${first.projectId}.json`);
    expect(stored?.contentType).toBe('application/json');
  });

  it('submits through the server checks, stores metrics and thumbnails, and ranks the showcase first', async () => {
    const designs = await container.deps.repos.designs.listByProject(first.projectId, 'submitted');
    expect(designs.every(({ metrics }) => metrics !== null)).toBe(true);
    expect(designs.every(({ thumbnailRef }) => thumbnailRef?.endsWith('.webp'))).toBe(true);
    expect(first.topFive.map(({ title }) => title)).toEqual(
      plan.designs.slice(0, TOP_COUNT).map(({ title }) => title),
    );
    expect(second.topFive).toEqual(first.topFive);
  });

  it('shows only the park, human titles and display names in public views', async () => {
    const shown = await publicNames(gateway, first.projectId);
    expect(shown.projects).toEqual(['Jonathan Rogers Park']);
    expect(shown.titles.filter((title) => SLUG_LIKE.test(title))).toEqual([]);
    const names = plan.people.residents.map(({ displayName }) => displayName);
    expect(names.filter((name) => SLUG_LIKE.test(name))).toEqual([]);
  });

  it('tells a stored blob from a missing one and writes a site file back', async () => {
    const design = (await gateway.listDesigns(first.projectId))[0];
    expect(await gateway.hasBlob(design?.thumbnailRef ?? '')).toBe(true);
    expect(await gateway.hasBlob('terrain/not-written.bin')).toBe(false);
    const bytes = new Uint8Array([1, 2, 3]);
    await gateway.storeBlob({ key: 'terrain/written.bin', bytes, contentType: 'text/plain' });
    expect(await gateway.hasBlob('terrain/written.bin')).toBe(true);
    expect((await container.deps.blobStore.get('terrain/written.bin'))?.bytes).toEqual(bytes);
  });
});

describe('seed gateway errors', () => {
  let container: ApiContainer;
  let gateway: ApiSeedGateway;
  let projectId: string;

  beforeAll(async () => {
    const seeded = await seedTwice();
    ({ container, gateway } = seeded);
    projectId = seeded.first.projectId;
  }, SEED_TIMEOUT_MS);

  afterAll(async () => {
    await container.close();
  });

  it('reports an error status and a design that breaks a hard rule', async () => {
    await expect(
      gateway.call({ method: 'GET', path: '/projects/no-such-project' }),
    ).rejects.toThrow(/404/);
    const [resident] = plan.people.residents;
    if (resident === undefined) throw new Error('no residents');
    const empty = designDocumentSchema.parse({
      version: 1,
      items: [],
      paths: [],
      areas: [],
      gradeDelta: { cells: [] },
      zones: [],
    });
    await expect(
      gateway.submitDesign({
        projectId: projectId,
        author: resident,
        title: 'No garden',
        blurb: '',
        document: empty,
      }),
    ).rejects.toThrow(/broke a hard rule/);
    await expect(
      gateway.castVote({ voterId: 'nobody', designId: 'x', value: 1, reasons: [] }),
    ).rejects.toThrow(/Unknown voter/);
    await expect(
      gateway.setSelfReport({ userId: 'nobody', report: { fsa: null, ageBand: null } }),
    ).rejects.toThrow(/Unknown resident/);
  });
});
