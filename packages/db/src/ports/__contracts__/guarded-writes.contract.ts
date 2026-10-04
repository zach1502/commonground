import { describe, expect, it } from 'vitest';

import {
  CONTRACT_START,
  MINUTE_MS,
  SEED_DOCUMENT,
  createdVersion,
  makeWorld,
  seedDraft,
  seedProject,
  seedUser,
  submittedDesign,
  uncapped,
} from './fixtures.js';
import type { ContractWorld, RepositoriesFactory } from './fixtures.js';

const DAY_MS = 86_400_000;
// CONTRACT_START is noon UTC on 1 September 2026, early on 1 September in Vancouver.
const CLOSES_TODAY = '2026-09-01';
const BENCH = { version: 1, items: ['bench'] };
const BENCH_CHANGES = { title: 'Bench corner', blurb: 'One bench.', document: BENCH };

async function withLive(factory: RepositoriesFactory, closesAt: string | null = null) {
  const world = await makeWorld(factory);
  const author = await seedUser(world.repos, 'author');
  const voter = await seedUser(world.repos, 'voter');
  const created = await seedProject(world.repos);
  const project = closesAt === null ? created : await setDay(world, created.id, closesAt);
  const live = submittedDesign(
    await world.repos.designs.submit(
      (await seedDraft(world.repos, project.id, author.id)).id,
      uncapped({}),
    ),
  );
  return { ...world, author, voter, project, live };
}

async function setDay(world: ContractWorld, id: string, closesAt: string) {
  const dated = await world.repos.projects.setClosesAt(id, closesAt);
  if (dated === undefined) throw new Error('the seeded project is missing');
  return dated;
}

/** Each way a project stops being open: staff close it, or its closing day ends on the clock. */
const closings = [
  {
    how: 'staff close it',
    closesAt: null,
    close: (world: ContractWorld, projectId: string) =>
      world.repos.projects.setStatus(projectId, 'closed').then(() => undefined),
  },
  {
    how: 'its closing day ends',
    closesAt: CLOSES_TODAY,
    close: (world: ContractWorld) => {
      world.clock.advance(DAY_MS);
      return Promise.resolve();
    },
  },
] as const;

function phaseGuards(name: string, factory: RepositoriesFactory): void {
  describe.each(closings)(`${name} guarded writes when $how`, ({ closesAt, close }) => {
    it('refuses a submit and leaves the draft as it was', async () => {
      const world = await withLive(factory, closesAt);
      const draft = await seedDraft(world.repos, world.project.id, world.author.id);
      await close(world, world.project.id);
      expect(await world.repos.designs.submit(draft.id, uncapped({}))).toEqual({
        kind: 'phase-closed',
      });
      expect(await world.repos.designs.findById(draft.id)).toEqual(draft);
    });

    it('refuses a save to a draft and leaves the draft as it was', async () => {
      const world = await withLive(factory, closesAt);
      const draft = await seedDraft(world.repos, world.project.id, world.author.id);
      await close(world, world.project.id);
      expect(await world.repos.designs.updateDraft(draft.id, BENCH_CHANGES)).toEqual({
        kind: 'phase-closed',
      });
      expect(await world.repos.designs.findById(draft.id)).toEqual(draft);
    });

    it('refuses a vote and moves no counter', async () => {
      const world = await withLive(factory, closesAt);
      await close(world, world.project.id);
      const cast = {
        userId: world.voter.id,
        designId: world.live.id,
        value: 1,
        reasons: [],
      } as const;
      await expect(world.repos.votes.upsertVote(cast)).rejects.toMatchObject({
        kind: 'phase-closed',
      });
      expect(await world.repos.votes.listByProject(world.project.id)).toEqual([]);
      expect(await world.repos.designs.findById(world.live.id)).toMatchObject({ up: 0, down: 0 });
    });

    it('refuses a new version and keeps the source live', async () => {
      const world = await withLive(factory, closesAt);
      await close(world, world.project.id);
      expect(await world.repos.designs.createVersion(world.live.id)).toEqual({
        kind: 'phase-closed',
      });
      expect((await world.repos.designs.findById(world.live.id))?.status).toBe('submitted');
      expect(await world.repos.designs.findVersionOf(world.live.id)).toBeUndefined();
    });

    it('refuses a new draft', async () => {
      const world = await withLive(factory, closesAt);
      await close(world, world.project.id);
      const source = { from: 'fork', designId: world.live.id } as const;
      const input = { projectId: world.project.id, authorId: world.voter.id, source };
      expect(await world.repos.designs.createDraft(input)).toEqual({ kind: 'phase-closed' });
      expect(await world.repos.designs.listByProject(world.project.id, 'draft')).toEqual([]);
    });
  });
}

function withdrawGuards(name: string, factory: RepositoriesFactory): void {
  describe.each(closings)(`${name} guarded withdraws when $how`, ({ closesAt, close }) => {
    it('refuses a withdraw and keeps the vote and its counter', async () => {
      const world = await withLive(factory, closesAt);
      const ids = { userId: world.voter.id, designId: world.live.id };
      await world.repos.votes.upsertVote({ ...ids, value: 1, reasons: [] });
      await close(world, world.project.id);
      await expect(world.repos.votes.withdrawVote(ids)).rejects.toMatchObject({
        kind: 'phase-closed',
      });
      expect(await world.repos.votes.listByProject(world.project.id)).toHaveLength(1);
      expect(await world.repos.designs.findById(world.live.id)).toMatchObject({ up: 1, down: 0 });
    });
  });
}

function closingDay(name: string, factory: RepositoriesFactory): void {
  describe(`${name} guarded writes on the closing day itself`, () => {
    it('still takes a vote while the closing day lasts', async () => {
      const world = await withLive(factory, CLOSES_TODAY);
      const cast = {
        userId: world.voter.id,
        designId: world.live.id,
        value: 1,
        reasons: [],
      } as const;
      expect((await world.repos.votes.upsertVote(cast)).counts).toEqual({ up: 1, down: 0 });
    });
  });
}

function draftCopies(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: createDraft`, () => {
    it('copies a live fork source and points forkedFrom at it', async () => {
      const { repos, project, voter, live } = await withLive(factory);
      const source = { from: 'fork', designId: live.id } as const;
      const input = { projectId: project.id, authorId: voter.id, source };
      const fork = createdVersion(await repos.designs.createDraft(input));
      expect(fork).toMatchObject({
        authorId: voter.id,
        title: live.title,
        document: live.document,
        forkedFrom: live.id,
        status: 'draft',
        createdAt: CONTRACT_START,
      });
    });

    it('refuses a fork source that is superseded or in another project', async () => {
      const { repos, project, voter, live } = await withLive(factory);
      const elsewhere = await seedProject(repos, 'Another park');
      const source = { from: 'fork', designId: live.id } as const;
      const away = { projectId: elsewhere.id, authorId: voter.id, source };
      expect(await repos.designs.createDraft(away)).toEqual({ kind: 'source-not-live' });
      createdVersion(await repos.designs.createVersion(live.id));
      const here = { projectId: project.id, authorId: voter.id, source };
      expect(await repos.designs.createDraft(here)).toEqual({ kind: 'source-not-live' });
    });
  });
}

function draftDocuments(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: createDraft documents`, () => {
    it('copies the baseline as stored when the draft is made, with a given title', async () => {
      const { repos, project, author, voter } = await withLive(factory);
      const baseline = await seedDraft(repos, project.id, author.id);
      const input = {
        projectId: project.id,
        authorId: voter.id,
        source: { from: 'baseline' },
      } as const;
      expect(await repos.designs.createDraft(input)).toEqual({ kind: 'no-baseline' });
      await repos.projects.setBaselineDesign(project.id, baseline.id);
      await repos.designs.updateDraft(baseline.id, { title: 'Today', blurb: '', document: BENCH });
      const copy = createdVersion(await repos.designs.createDraft({ ...input, title: 'Mine' }));
      expect(copy).toMatchObject({ title: 'Mine', document: BENCH, forkedFrom: null });
    });

    it('stores a given document and rejects an unknown project or author', async () => {
      const { repos, project, voter } = await withLive(factory);
      const source = { from: 'document', document: SEED_DOCUMENT, title: 'Blank' } as const;
      const draft = createdVersion(
        await repos.designs.createDraft({ projectId: project.id, authorId: voter.id, source }),
      );
      expect(draft).toMatchObject({ title: 'Blank', document: SEED_DOCUMENT, blurb: '' });
      const noProject = { projectId: 'missing', authorId: voter.id, source };
      await expect(repos.designs.createDraft(noProject)).rejects.toMatchObject({
        kind: 'missing-reference',
      });
      const noAuthor = { projectId: project.id, authorId: 'missing', source };
      await expect(repos.designs.createDraft(noAuthor)).rejects.toMatchObject({
        kind: 'missing-reference',
      });
    });
  });
}

function versionsAndThumbnails(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: versions and stamps`, () => {
    it('makes one version of two at once and keeps the votes on the source', async () => {
      const { repos, project, voter, live } = await withLive(factory);
      await repos.votes.upsertVote({ userId: voter.id, designId: live.id, value: 1, reasons: [] });
      const results = await Promise.all([
        repos.designs.createVersion(live.id),
        repos.designs.createVersion(live.id),
      ]);
      expect(results.map((result) => result.kind).sort()).toEqual(['created', 'not-submitted']);
      const drafts = await repos.designs.listByProject(project.id, 'draft');
      expect(drafts.filter((design) => design.versionOf === live.id)).toHaveLength(1);
      expect(await repos.designs.findById(live.id)).toMatchObject({ up: 1, down: 0 });
      const votes = await repos.votes.listByProject(project.id);
      expect(votes.map((vote) => vote.designId)).toEqual([live.id]);
    });

    it('attaches a thumbnail only while the design keeps the stamp it was read with', async () => {
      const { repos, project, author, clock } = await withLive(factory);
      const draft = await seedDraft(repos, project.id, author.id);
      clock.advance(MINUTE_MS);
      await repos.designs.updateDraft(draft.id, { title: 'x', blurb: 'y', document: BENCH });
      const stale = { thumbnailRef: 'thumbnails/old.png', expectedUpdatedAt: draft.updatedAt };
      expect(await repos.designs.setThumbnail(draft.id, stale)).toEqual({ kind: 'changed' });
      expect((await repos.designs.findById(draft.id))?.thumbnailRef).toBeNull();
    });
  });
}

function statusChanges(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the ProjectRepository contract: changeStatus`, () => {
    it('changes status and day together, and answers unchanged or missing', async () => {
      const { repos, project } = await withLive(factory);
      const closed = await repos.projects.changeStatus(project.id, { status: 'closed' });
      expect(closed).toMatchObject({ kind: 'changed', project: { status: 'closed' } });
      const again = await repos.projects.changeStatus(project.id, { status: 'closed' });
      expect(again).toEqual({ kind: 'unchanged' });
      const change = { status: 'closed', closesAt: '2026-10-31' } as const;
      const moved = await repos.projects.changeStatus(project.id, change);
      expect(moved).toMatchObject({ kind: 'changed', project: change });
      expect(await repos.projects.changeStatus(project.id, change)).toEqual({ kind: 'unchanged' });
      expect(await repos.projects.changeStatus('missing', change)).toEqual({ kind: 'missing' });
    });

    it('lets one of two identical closes at once change the project', async () => {
      const { repos, project } = await withLive(factory);
      const results = await Promise.all([
        repos.projects.changeStatus(project.id, { status: 'closed' }),
        repos.projects.changeStatus(project.id, { status: 'closed' }),
      ]);
      expect(results.map((result) => result.kind).sort()).toEqual(['changed', 'unchanged']);
    });
  });
}

/** Writes that must land while the project is open, and the copies and stamps they take. */
export function guardedWritesContract(name: string, factory: RepositoriesFactory): void {
  phaseGuards(name, factory);
  withdrawGuards(name, factory);
  closingDay(name, factory);
  draftCopies(name, factory);
  draftDocuments(name, factory);
  versionsAndThumbnails(name, factory);
  statusChanges(name, factory);
}
