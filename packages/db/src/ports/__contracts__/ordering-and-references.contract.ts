import { describe, expect, it } from 'vitest';

import {
  MINUTE_MS,
  makeWorld,
  seedDraft,
  seedProject,
  seedUser,
  submittedDesign,
  uncapped,
} from './fixtures.js';
import type { RepositoriesFactory } from './fixtures.js';

const idsOf = (rows: readonly { readonly id: string }[]) => rows.map(({ id }) => id);

async function withAuthors(factory: RepositoriesFactory) {
  const world = await makeWorld(factory);
  const author = await seedUser(world.repos, 'user-a');
  const other = await seedUser(world.repos, 'user-b');
  const project = await seedProject(world.repos);
  return { ...world, author, other, project };
}

function listOrder(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the list order contract`, () => {
    it('lists live designs by submit time, not by id or creation time', async () => {
      const { repos, clock, author, other, project } = await withAuthors(factory);
      const early = await seedDraft(repos, project.id, author.id);
      const late = await seedDraft(repos, project.id, other.id);
      clock.advance(MINUTE_MS);
      submittedDesign(await repos.designs.submit(late.id, uncapped({})));
      clock.advance(MINUTE_MS);
      submittedDesign(await repos.designs.submit(early.id, uncapped({})));
      const listed = await repos.designs.listByProject(project.id, 'submitted');
      expect(idsOf(listed)).toEqual([early.id, late.id]);
    });

    it('lists drafts by creation time, newest first, even when the clock went back', async () => {
      const { repos, clock, author, project } = await withAuthors(factory);
      const first = await seedDraft(repos, project.id, author.id);
      clock.advance(-MINUTE_MS);
      const earlier = await seedDraft(repos, project.id, author.id);
      const listed = await repos.designs.listByProject(project.id, 'draft');
      expect(idsOf(listed)).toEqual([first.id, earlier.id]);
    });

    it('breaks a tie in time by id, highest first', async () => {
      const { repos, author, project } = await withAuthors(factory);
      const lower = await seedDraft(repos, project.id, author.id);
      const higher = await seedDraft(repos, project.id, author.id);
      const listed = await repos.designs.listByProject(project.id, 'draft');
      expect(idsOf(listed)).toEqual([higher.id, lower.id]);
    });

    it('lists projects by creation time, oldest first, then by id', async () => {
      const { repos, clock } = await makeWorld(factory);
      const later = await seedProject(repos, 'Later');
      clock.advance(-MINUTE_MS);
      const earlier = await seedProject(repos, 'Earlier');
      const tied = await seedProject(repos, 'Tied');
      expect(idsOf(await repos.projects.list())).toEqual([earlier.id, tied.id, later.id]);
    });
  });
}

function references(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the missing reference contract`, () => {
    it('names the missing project or author when a design is created', async () => {
      const { repos, author, project } = await withAuthors(factory);
      await expect(seedDraft(repos, 'no-project', author.id)).rejects.toMatchObject({
        reference: 'project no-project',
      });
      await expect(seedDraft(repos, project.id, 'no-author')).rejects.toMatchObject({
        reference: 'user no-author',
      });
    });

    it('names the missing project or author when a draft is made from a document', async () => {
      const { repos, author, project } = await withAuthors(factory);
      const source = { from: 'document', document: { version: 1 }, title: 'Blank' } as const;
      const draft = { projectId: project.id, authorId: author.id, source };
      await expect(
        repos.designs.createDraft({ ...draft, projectId: 'no-project' }),
      ).rejects.toMatchObject({ reference: 'project no-project' });
      await expect(
        repos.designs.createDraft({ ...draft, authorId: 'no-author' }),
      ).rejects.toMatchObject({ reference: 'user no-author' });
    });

    it('refuses a fork of a design id that does not exist', async () => {
      const { repos, author, project } = await withAuthors(factory);
      const source = { from: 'fork', designId: 'no-design' } as const;
      expect(
        await repos.designs.createDraft({ projectId: project.id, authorId: author.id, source }),
      ).toEqual({ kind: 'source-not-live' });
    });

    it('finds no vote target for a design id that does not exist', async () => {
      const { repos } = await withAuthors(factory);
      expect(await repos.designs.findVoteTarget('no-design')).toBeUndefined();
    });

    it('names the design whose project closed when a vote is refused', async () => {
      const { repos, author, other, project } = await withAuthors(factory);
      const design = submittedDesign(
        await repos.designs.submit(
          (await seedDraft(repos, project.id, author.id)).id,
          uncapped({}),
        ),
      );
      await repos.projects.changeStatus(project.id, { status: 'closed' });
      const vote = { userId: other.id, designId: design.id, value: 1, reasons: [] } as const;
      await expect(repos.votes.upsertVote(vote)).rejects.toMatchObject({
        kind: 'phase-closed',
        reference: `design ${design.id}`,
      });
    });
  });
}

function stamps(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the stamp contract`, () => {
    it('keeps the closing day when a status change does not name one', async () => {
      const { repos, project } = await withAuthors(factory);
      await repos.projects.setClosesAt(project.id, '2026-10-31');
      const closed = await repos.projects.changeStatus(project.id, { status: 'closed' });
      expect(closed).toMatchObject({
        kind: 'changed',
        project: { status: 'closed', closesAt: '2026-10-31' },
      });
      expect(await repos.projects.findById(project.id)).toMatchObject({ closesAt: '2026-10-31' });
    });

    it('stamps a new vote with the time now and keeps that stamp when the vote changes', async () => {
      const { repos, clock, author, other, project } = await withAuthors(factory);
      const draft = await seedDraft(repos, project.id, author.id);
      const design = submittedDesign(await repos.designs.submit(draft.id, uncapped({})));
      const cast = { userId: other.id, designId: design.id, reasons: [] } as const;
      const created = clock.now();
      const first = await repos.votes.upsertVote({ ...cast, value: 1 });
      expect(first.vote.createdAt).toEqual(created);
      clock.advance(MINUTE_MS);
      const changed = await repos.votes.upsertVote({ ...cast, value: -1 });
      expect(changed.vote.createdAt).toEqual(created);
      expect(changed.vote.updatedAt).toEqual(clock.now());
    });
  });
}

/** List order, the references a refused write names, and the stamps a write keeps. */
export function orderingAndReferencesContract(name: string, factory: RepositoriesFactory): void {
  listOrder(name, factory);
  references(name, factory);
  stamps(name, factory);
}
