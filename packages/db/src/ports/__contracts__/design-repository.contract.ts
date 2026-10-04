import { describe, expect, it } from 'vitest';

import { draftSaveContract } from './draft-save.contract.js';
import {
  CONTRACT_START,
  MINUTE_MS,
  SEED_DOCUMENT,
  makeWorld,
  seedDraft,
  seedProject,
  seedUser,
  createdVersion,
  submittedDesign,
  uncapped,
} from './fixtures.js';
import type { ContractWorld, RepositoriesFactory } from './fixtures.js';

const BENCH_DOCUMENT = { version: 1, items: [{ id: 'bench-1', catalogId: 'bench' }] };

async function withDraft(factory: RepositoriesFactory) {
  const world = await makeWorld(factory);
  const author = await seedUser(world.repos);
  const project = await seedProject(world.repos);
  const draft = await seedDraft(world.repos, project.id, author.id);
  return { ...world, author, project, draft };
}

async function submitted(world: ContractWorld, projectId: string, authorId: string) {
  const draft = await seedDraft(world.repos, projectId, authorId);
  world.clock.advance(MINUTE_MS);
  return submittedDesign(await world.repos.designs.submit(draft.id, uncapped({ score: 1 })));
}

function draftLifecycle(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: drafts`, () => {
    it('creates a draft with zero votes and no metrics', async () => {
      const { repos, draft, project, author } = await withDraft(factory);
      expect(draft).toMatchObject({
        projectId: project.id,
        authorId: author.id,
        status: 'draft',
        metrics: null,
        up: 0,
        down: 0,
        forkedFrom: null,
        versionOf: null,
        thumbnailRef: null,
        submittedAt: null,
        createdAt: CONTRACT_START,
      });
      expect(await repos.designs.findById(draft.id)).toEqual(draft);
      expect(await repos.designs.findById('missing')).toBeUndefined();
    });

    it('rejects a draft for an unknown project or author', async () => {
      const { repos, project, author } = await withDraft(factory);
      await expect(seedDraft(repos, 'no-project', author.id)).rejects.toMatchObject({
        kind: 'missing-reference',
      });
      await expect(seedDraft(repos, project.id, 'no-author')).rejects.toMatchObject({
        kind: 'missing-reference',
      });
    });

    it('saves draft changes', async () => {
      const { repos, draft } = await withDraft(factory);
      const changes = { title: 'New', blurb: 'Changed', document: { version: 1, items: [1] } };
      expect(await repos.designs.updateDraft(draft.id, changes)).toMatchObject({
        kind: 'saved',
        design: changes,
      });
      expect(await repos.designs.updateDraft('missing', changes)).toEqual({ kind: 'not-draft' });
    });

    it('submits a draft once, storing metrics and the time', async () => {
      const { repos, draft, clock } = await withDraft(factory);
      clock.advance(MINUTE_MS);
      const design = submittedDesign(
        await repos.designs.submit(draft.id, uncapped({ costCad: 10 })),
      );
      expect(design).toMatchObject({ status: 'submitted', metrics: { costCad: 10 } });
      expect(design.submittedAt).toEqual(new Date(CONTRACT_START.getTime() + MINUTE_MS));
      expect(await repos.designs.submit(draft.id, uncapped({}))).toEqual({ kind: 'not-draft' });
      expect(await repos.designs.submit('missing', uncapped({}))).toEqual({ kind: 'not-draft' });
      const changes = { title: 'x', blurb: 'y', document: {} };
      expect(await repos.designs.updateDraft(draft.id, changes)).toEqual({ kind: 'not-draft' });
    });
  });
}

function measuredDocument(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: the measured document`, () => {
    it('refuses a submit when a save replaced the document after it was measured', async () => {
      const { repos, draft } = await withDraft(factory);
      const measured = draft.document;
      const edited = {
        title: 'Edited',
        blurb: 'Saved from a second tab.',
        document: BENCH_DOCUMENT,
      };
      await repos.designs.updateDraft(draft.id, edited);
      expect(await repos.designs.submit(draft.id, uncapped({ score: 1 }, measured))).toEqual({
        kind: 'changed',
      });
      expect(await repos.designs.findById(draft.id)).toMatchObject({
        status: 'draft',
        metrics: null,
        submittedAt: null,
        document: BENCH_DOCUMENT,
      });
      const resubmit = await repos.designs.submit(draft.id, uncapped({ score: 1 }, BENCH_DOCUMENT));
      expect(resubmit.kind).toBe('submitted');
    });

    it('matches the measured document by value, whatever the key order', async () => {
      const { repos, draft } = await withDraft(factory);
      const reordered = { items: [], version: 1 };
      expect((await repos.designs.submit(draft.id, uncapped({}, reordered))).kind).toBe(
        'submitted',
      );
    });
  });
}

function versionsAndLists(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: versions and lists`, () => {
    it('makes a new draft version and supersedes the source', async () => {
      const world = await withDraft(factory);
      const source = await submitted(world, world.project.id, world.author.id);
      const version = createdVersion(await world.repos.designs.createVersion(source.id));
      expect(version).toMatchObject({
        status: 'draft',
        versionOf: source.id,
        title: source.title,
        document: source.document,
        authorId: source.authorId,
      });
      expect((await world.repos.designs.findById(source.id))?.status).toBe('superseded');
    });

    it('finds the successor draft of a superseded design', async () => {
      const world = await withDraft(factory);
      const source = await submitted(world, world.project.id, world.author.id);
      expect(await world.repos.designs.findVersionOf(source.id)).toBeUndefined();
      const version = createdVersion(await world.repos.designs.createVersion(source.id));
      expect((await world.repos.designs.findVersionOf(source.id))?.id).toBe(version.id);
    });

    it('records a thumbnail key on a design', async () => {
      const world = await withDraft(factory);
      const source = await submitted(world, world.project.id, world.author.id);
      const stamp = { thumbnailRef: 'thumbnails/one.png', expectedUpdatedAt: source.updatedAt };
      const stored = await world.repos.designs.setThumbnail(source.id, stamp);
      expect(stored.kind === 'attached' ? stored.design.thumbnailRef : stored.kind).toBe(
        'thumbnails/one.png',
      );
      expect((await world.repos.designs.findById(source.id))?.thumbnailRef).toBe(
        'thumbnails/one.png',
      );
      expect(await world.repos.designs.setThumbnail('missing', stamp)).toEqual({ kind: 'missing' });
    });

    it('makes versions only from submitted designs', async () => {
      const { repos, draft } = await withDraft(factory);
      expect(await repos.designs.createVersion(draft.id)).toEqual({ kind: 'not-submitted' });
      expect(await repos.designs.createVersion('missing')).toEqual({ kind: 'not-submitted' });
    });

    it('lists by status, newest submission first, and counts per author', async () => {
      const world = await withDraft(factory);
      const other = await seedUser(world.repos, 'user-b');
      const older = await submitted(world, world.project.id, world.author.id);
      const newer = await submitted(world, world.project.id, other.id);
      const listed = await world.repos.designs.listByProject(world.project.id, 'submitted');
      expect(listed.map((design) => design.id)).toEqual([newer.id, older.id]);
      const drafts = await world.repos.designs.listByProject(world.project.id, 'draft');
      expect(drafts.map((design) => design.id)).toEqual([world.draft.id]);
      const { designs } = world.repos;
      expect(await designs.countByAuthor(world.project.id, world.author.id, 'submitted')).toBe(1);
      expect(await designs.countByAuthor(world.project.id, other.id, 'draft')).toBe(0);
      expect(await designs.listByProject('other-project', 'submitted')).toEqual([]);
    });
  });
}

const LIVE_CAP = 3;
const RACING_SUBMITS = 5;

function liveCap(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: the live cap`, () => {
    it('refuses a submit once the author has the cap of live designs in the project', async () => {
      const world = await withDraft(factory);
      const { repos, project, author } = world;
      for (let index = 0; index < LIVE_CAP; index += 1) {
        await submitted(world, project.id, author.id);
      }
      const capped = { metrics: {}, document: SEED_DOCUMENT, liveCap: LIVE_CAP };
      expect(await repos.designs.submit(world.draft.id, capped)).toEqual({
        kind: 'live-cap-reached',
        live: LIVE_CAP,
      });
      expect((await repos.designs.findById(world.draft.id))?.status).toBe('draft');
      const elsewhere = await seedProject(repos, 'Another park');
      const other = await seedDraft(repos, elsewhere.id, author.id);
      expect((await repos.designs.submit(other.id, capped)).kind).toBe('submitted');
    });

    it('lets only the cap through when one author submits many drafts at once', async () => {
      const { repos, project, author } = await withDraft(factory);
      const drafts = await Promise.all(
        Array.from({ length: RACING_SUBMITS }, () => seedDraft(repos, project.id, author.id)),
      );
      const results = await Promise.all(
        drafts.map((draft) =>
          repos.designs.submit(draft.id, {
            metrics: {},
            document: SEED_DOCUMENT,
            liveCap: LIVE_CAP,
          }),
        ),
      );
      const kinds = results.map((result) => result.kind).sort();
      expect(kinds).toEqual([
        ...Array<string>(RACING_SUBMITS - LIVE_CAP).fill('live-cap-reached'),
        ...Array<string>(LIVE_CAP).fill('submitted'),
      ]);
      expect(await repos.designs.countByAuthor(project.id, author.id, 'submitted')).toBe(LIVE_CAP);
    });
  });
}

function withoutDocument(design: object) {
  return Object.fromEntries(Object.entries(design).filter(([key]) => key !== 'document'));
}

/** Two authors with one live design each, and the project's live designs in list order. */
async function twoLiveDesigns(factory: RepositoriesFactory) {
  const world = await withDraft(factory);
  const other = await seedUser(world.repos, 'user-b');
  await submitted(world, world.project.id, world.author.id);
  await submitted(world, world.project.id, other.id);
  const { designs } = world.repos;
  const full = await designs.listByProject(world.project.id, 'submitted');
  return { designs, full, project: world.project };
}

function summaries(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the DesignRepository contract: summaries`, () => {
    it('lists summaries in list order with every field but the document', async () => {
      const { designs, full, project } = await twoLiveDesigns(factory);
      const listed = await designs.listSummariesByProject(project.id, 'submitted');
      expect(listed).toEqual(full.map(withoutDocument));
      expect(listed.every((summary) => !('document' in summary))).toBe(true);
      expect(await designs.listSummariesByProject('other-project', 'submitted')).toEqual([]);
    });

    it('finds a summary with its project status, closing day and baseline in one read', async () => {
      const { repos, draft, project } = await withDraft(factory);
      expect(await repos.designs.findVoteTarget(draft.id)).toEqual({
        design: withoutDocument(draft),
        project: {
          id: project.id,
          status: project.status,
          closesAt: project.closesAt,
          baselineDesignId: project.baselineDesignId,
        },
      });
      expect(await repos.designs.findVoteTarget('missing')).toBeUndefined();
    });

    it('lists queue candidates in list order with only ids, author and counts', async () => {
      const { designs, full, project } = await twoLiveDesigns(factory);
      expect(await designs.listQueueCandidates(project.id)).toEqual(
        full.map(({ id, authorId, up, down }) => ({ id, authorId, up, down })),
      );
      expect(await designs.listQueueCandidates('other-project')).toEqual([]);
    });

    it('finds summaries for a list of ids in the order asked, skipping unknown ids', async () => {
      const world = await withDraft(factory);
      const live = await submitted(world, world.project.id, world.author.id);
      const { designs } = world.repos;
      const found = await designs.findSummariesByIds([live.id, 'missing', world.draft.id]);
      expect(found.map((summary) => summary.id)).toEqual([live.id, world.draft.id]);
      expect(found[0]).toEqual(withoutDocument(live));
      expect(await designs.findSummariesByIds([])).toEqual([]);
    });

    it('finds one summary by id, or undefined', async () => {
      const { repos, draft } = await withDraft(factory);
      expect(await repos.designs.findSummaryById(draft.id)).toEqual(withoutDocument(draft));
      expect(await repos.designs.findSummaryById('missing')).toBeUndefined();
    });
  });
}

/** Behaviour every DesignRepository adapter must have. */
export function designRepositoryContract(name: string, factory: RepositoriesFactory): void {
  draftLifecycle(name, factory);
  measuredDocument(name, factory);
  versionsAndLists(name, factory);
  liveCap(name, factory);
  summaries(name, factory);
  draftSaveContract(name, factory);
}
