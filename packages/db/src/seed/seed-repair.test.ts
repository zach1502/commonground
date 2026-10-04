import { describe, expect, it } from 'vitest';

import type { Design } from '../ports/records.js';

import { seedWorld } from './in-memory-seed-gateway.js';
import { loadJonathanRogersSite } from './jonathan-rogers.js';
import { buildSeedPlan } from './plan.js';

const SOLVE_TIMEOUT_MS = 300_000;
// Room for the seeded designs plus the two copies, whatever the app's own cap is.
const COPY_LIVE_CAP = 1000;

const site = loadJonathanRogersSite();
const plan = buildSeedPlan(site, { generatedCount: 2 });

/** A database seeded once, whose blob store then lost some of the seed's blobs. */
async function seededThenLost(lose: (keys: Set<string>) => readonly string[]) {
  const world = seedWorld(plan);
  const first = await world.run();
  const lost = lose(world.blobs.keys);
  for (const key of lost) world.blobs.keys.delete(key);
  return { ...world, first, lost };
}

async function thumbnailRefOf(world: ReturnType<typeof seedWorld>, designId: string) {
  return (await world.repos.designs.findById(designId))?.thumbnailRef ?? null;
}

/** A second submitted design with the same author and title, and no picture yet. */
async function copyOf(world: ReturnType<typeof seedWorld>, original: Design): Promise<string> {
  const copy = await world.repos.designs.create({
    projectId: original.projectId,
    authorId: original.authorId,
    title: original.title,
    blurb: original.blurb,
    document: original.document,
    forkedFrom: null,
  });
  await world.repos.designs.submit(copy.id, {
    metrics: {},
    document: original.document,
    liveCap: COPY_LIVE_CAP,
  });
  return copy.id;
}

describe('runSeed on a database whose blobs went missing', () => {
  it(
    'redraws a design whose picture is missing and skips the designs whose picture is there',
    async () => {
      const world = seedWorld(plan);
      const first = await world.run();
      const [, design] = await world.repos.designs.listByProject(first.projectId, 'submitted');
      if (design?.thumbnailRef == null) throw new Error('the first run drew no picture');
      world.blobs.keys.delete(design.thumbnailRef);
      const second = await world.run();
      expect(second.thumbnails).toEqual({ mode: 'poster', rendered: 1 });
      expect(world.thumbnails.drawn[1]?.map((job) => job.design.id)).toEqual([design.id]);
      expect(world.blobs.keys.has(design.thumbnailRef)).toBe(true);
    },
    SOLVE_TIMEOUT_MS,
  );

  it(
    'redraws the park today when its picture is missing',
    async () => {
      const world = seedWorld(plan);
      const first = await world.run();
      const project = await world.repos.projects.findById(first.projectId);
      const baselineId = project?.baselineDesignId ?? '';
      const ref = await thumbnailRefOf(world, baselineId);
      if (ref === null) throw new Error('the first run drew no baseline picture');
      world.blobs.keys.delete(ref);
      await world.run();
      expect(world.thumbnails.drawn[1]?.map(({ design, picture }) => [design.id, picture])).toEqual(
        [[baselineId, 'baseline']],
      );
    },
    SOLVE_TIMEOUT_MS,
  );

  it(
    'stores the heightmap again when it is missing, and leaves stored blobs alone',
    async () => {
      const world = await seededThenLost(() => [site.heightmapRef]);
      expect(world.blobs.writes).toEqual([]);
      await world.run();
      expect(world.blobs.writes).toEqual(world.lost);
      expect(site.blobs.every(({ key }) => world.blobs.keys.has(key))).toBe(true);
    },
    SOLVE_TIMEOUT_MS,
  );

  it(
    'writes no blob and draws nothing when every blob is there',
    async () => {
      const world = await seededThenLost(() => []);
      const second = await world.run();
      expect(world.blobs.writes).toEqual([]);
      expect(second.thumbnails).toEqual({ mode: 'skipped', rendered: 0 });
      expect(world.thumbnails.drawn).toHaveLength(1);
    },
    SOLVE_TIMEOUT_MS,
  );
});

describe('runSeed on a database with two copies of a seeded design', () => {
  it(
    'draws a picture for every stored copy of a seeded design, not only the copy it matched',
    async () => {
      const world = seedWorld(plan);
      const first = await world.run();
      const [original] = await world.repos.designs.listByProject(first.projectId, 'submitted');
      if (original === undefined) throw new Error('the first run stored no design');
      const copies = [await copyOf(world, original), await copyOf(world, original)];
      await world.run();
      expect(world.thumbnails.drawn[1]?.map((job) => job.design.id).sort()).toEqual(copies.sort());
    },
    SOLVE_TIMEOUT_MS,
  );
});
