import { describe, expect, it } from 'vitest';

import type { Repositories } from '../ports/repositories.js';

import { seedWorld } from './in-memory-seed-gateway.js';
import { loadJonathanRogersSite } from './jonathan-rogers.js';
import { buildSeedPlan, designKey } from './plan.js';
import { runSeed } from './seed.js';
import { TOP_COUNT } from './votes.js';

const SEED_COMMENTS = 6;

async function commentRows(repos: Repositories, projectId: string): Promise<number> {
  return (await repos.elementComments.listByProject(projectId, { hidden: 'include' })).length;
}
const SOLVE_TIMEOUT_MS = 300_000;

const site = loadJonathanRogersSite();
const plan = buildSeedPlan(site, { generatedCount: 2 });

function seeded() {
  return seedWorld(plan);
}

describe('runSeed', () => {
  it(
    'creates the project, designs, votes and self reports, and a second run changes nothing',
    async () => {
      const { run, thumbnails, repos } = seeded();
      const first = await run();
      const second = await run();
      expect(first.counts).toEqual({
        designs: plan.designs.length,
        votes: plan.votes.length,
        voters: new Set(plan.votes.map(({ voterId }) => voterId)).size,
        selfReports: plan.selfReports.length,
      });
      expect(second.counts).toEqual(first.counts);
      expect(first.comments).toBe(SEED_COMMENTS);
      expect(await commentRows(repos, first.projectId)).toBe(SEED_COMMENTS);
      expect(first.createdDesigns).toBe(plan.designs.length);
      expect(second.createdDesigns).toBe(0);
      expect(thumbnails.drawn.map((jobs) => jobs.length)).toEqual([plan.designs.length + 1]);
      expect(second.thumbnails).toEqual({ mode: 'skipped', rendered: 0 });
      expect(second.projectId).toBe(first.projectId);
    },
    SOLVE_TIMEOUT_MS,
  );

  it(
    'puts the showcase designs in the top five, the same on a fresh database',
    async () => {
      const first = await seeded().run();
      const again = await seeded().run();
      const titles = first.topFive.map(({ title }) => title);
      expect(titles).toEqual(plan.designs.slice(0, TOP_COUNT).map(({ title }) => title));
      expect(again.topFive.map(({ title }) => title)).toEqual(titles);
    },
    SOLVE_TIMEOUT_MS,
  );

  it(
    'records how long each phase took on the injected clock',
    async () => {
      const summary = await seeded().run();
      expect(Object.keys(summary.timingsMs).sort()).toEqual(
        ['comments', 'designs', 'project', 'selfReports', 'thumbnails', 'votes'].sort(),
      );
    },
    SOLVE_TIMEOUT_MS,
  );
});

describe('runSeed baseline picture', () => {
  it(
    'draws the park today as the staff author, so the project page shows a render',
    async () => {
      const { run, thumbnails, repos } = seeded();
      const summary = await run();
      const project = await repos.projects.findById(summary.projectId);
      const jobs = thumbnails.drawn.flat();
      const baseline = jobs.find(({ design }) => design.id === project?.baselineDesignId);
      expect(baseline?.author).toEqual(plan.people.staff);
      expect(jobs.filter(({ author }) => author.id === plan.people.staff.id)).toHaveLength(1);
    },
    SOLVE_TIMEOUT_MS,
  );

  it(
    'asks for the large baseline picture for the park today and thumbnails for designs',
    async () => {
      const { run, thumbnails, repos } = seeded();
      const summary = await run();
      const project = await repos.projects.findById(summary.projectId);
      const jobs = thumbnails.drawn.flat();
      const pictures = jobs.map(({ design, picture }) => ({
        baseline: design.id === project?.baselineDesignId,
        picture,
      }));
      expect(pictures.filter(({ picture }) => picture === 'baseline')).toEqual([
        { baseline: true, picture: 'baseline' },
      ]);
      expect(pictures.filter(({ picture }) => picture === 'design')).toHaveLength(
        plan.designs.length,
      );
    },
    SOLVE_TIMEOUT_MS,
  );
});

describe('runSeed after an interrupted run', () => {
  it(
    'finishes a draft left behind instead of making a second one',
    async () => {
      const { repos, options, run } = seeded();
      const first = await run();
      const [planned] = plan.designs;
      if (planned === undefined) throw new Error('empty plan');
      const draft = await repos.designs.create({
        projectId: first.projectId,
        authorId: planned.author.id,
        title: 'Half done',
        blurb: '',
        document: planned.build().document,
        forkedFrom: null,
      });
      const extra = {
        ...planned,
        title: 'Half done',
        key: designKey(planned.author.id, 'Half done'),
      };
      const resumed = await runSeed({
        ...options,
        plan: { ...plan, designs: [...plan.designs, extra] },
      });
      expect(resumed.createdDesigns).toBe(1);
      expect((await repos.designs.findById(draft.id))?.status).toBe('submitted');
    },
    SOLVE_TIMEOUT_MS,
  );
});
