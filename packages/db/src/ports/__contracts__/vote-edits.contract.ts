import { describe, expect, it } from 'vitest';

import { MINUTE_MS, makeWorld, seedDraft, seedProject, seedUser, uncapped } from './fixtures.js';
import type { RepositoriesFactory } from './fixtures.js';

async function withDesign(factory: RepositoriesFactory) {
  const world = await makeWorld(factory);
  const author = await seedUser(world.repos, 'author');
  const voter = await seedUser(world.repos, 'voter');
  const project = await seedProject(world.repos);
  const design = await seedDraft(world.repos, project.id, author.id);
  await world.repos.designs.submit(design.id, uncapped({}));
  return { ...world, voter, project, design };
}

async function countsOf(world: Awaited<ReturnType<typeof withDesign>>) {
  const design = await world.repos.designs.findById(world.design.id);
  return { up: design?.up, down: design?.down };
}

function comments(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the VoteRepository contract: comments and reasons`, () => {
    it('stores the comment with the vote and reads it back', async () => {
      const { repos, voter, design } = await withDesign(factory);
      const cast = { userId: voter.id, designId: design.id, value: 1, reasons: [] } as const;
      const { vote } = await repos.votes.upsertVote({ ...cast, comment: 'More shade, please.' });
      expect(vote.comment).toBe('More shade, please.');
      const [stored] = await repos.votes.listByUser(voter.id);
      expect(stored?.comment).toBe('More shade, please.');
    });

    it('stores no comment when the vote has none, and clears one on a change without it', async () => {
      const { repos, voter, design } = await withDesign(factory);
      const cast = { userId: voter.id, designId: design.id, value: -1, reasons: [] } as const;
      expect((await repos.votes.upsertVote(cast)).vote.comment).toBeNull();
      await repos.votes.upsertVote({ ...cast, comment: 'Too much paving.' });
      expect((await repos.votes.upsertVote(cast)).vote.comment).toBeNull();
      expect((await repos.votes.listByProject(design.projectId))[0]?.comment).toBeNull();
    });

    it('changes only the reasons and comment and leaves the counters alone', async () => {
      const world = await withDesign(factory);
      const { repos, voter, design, clock } = world;
      const cast = { userId: voter.id, designId: design.id, value: 1, reasons: ['trees'] } as const;
      const first = await repos.votes.upsertVote(cast);
      clock.advance(MINUTE_MS);
      const edited = await repos.votes.upsertVote({
        ...cast,
        reasons: ['paths', 'water'],
        comment: 'The loop path is good.',
      });
      expect(edited).toMatchObject({ outcome: 'updated', counts: { up: 1, down: 0 } });
      expect(edited.vote).toMatchObject({ id: first.vote.id, reasons: ['paths', 'water'] });
      expect(edited.vote.updatedAt.getTime()).toBe(first.vote.updatedAt.getTime() + MINUTE_MS);
      expect(await countsOf(world)).toEqual({ up: 1, down: 0 });
    });
  });
}

function withdrawals(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the VoteRepository contract: withdraw`, () => {
    it('removes an up vote and takes it off the up counter', async () => {
      const world = await withDesign(factory);
      const { repos, voter, design } = world;
      await repos.votes.upsertVote({
        userId: voter.id,
        designId: design.id,
        value: 1,
        reasons: [],
      });
      const withdrawn = await repos.votes.withdrawVote({ userId: voter.id, designId: design.id });
      expect(withdrawn).toEqual({ outcome: 'withdrawn', counts: { up: 0, down: 0 } });
      expect(await repos.votes.listByUser(voter.id)).toEqual([]);
      expect(await countsOf(world)).toEqual({ up: 0, down: 0 });
    });

    it('removes a down vote and leaves the other voters counted', async () => {
      const world = await withDesign(factory);
      const { repos, voter, design } = world;
      const other = await seedUser(repos, 'other');
      await repos.votes.upsertVote({
        userId: other.id,
        designId: design.id,
        value: -1,
        reasons: [],
      });
      await repos.votes.upsertVote({
        userId: voter.id,
        designId: design.id,
        value: -1,
        reasons: [],
      });
      const withdrawn = await repos.votes.withdrawVote({ userId: voter.id, designId: design.id });
      expect(withdrawn).toEqual({ outcome: 'withdrawn', counts: { up: 0, down: 1 } });
      expect(await repos.votes.totalsForProject(design.projectId)).toEqual({
        votes: 1,
        uniqueVoters: 1,
      });
    });

    it('answers absent with the counters as they are when there is no vote', async () => {
      const world = await withDesign(factory);
      const { repos, voter, design } = world;
      const other = await seedUser(repos, 'other');
      await repos.votes.upsertVote({
        userId: other.id,
        designId: design.id,
        value: 1,
        reasons: [],
      });
      const answer = await repos.votes.withdrawVote({ userId: voter.id, designId: design.id });
      expect(answer).toEqual({ outcome: 'absent', counts: { up: 1, down: 0 } });
    });
  });
}

function afterWithdraw(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the VoteRepository contract: after a withdraw`, () => {
    it('lets the person vote again after a withdraw', async () => {
      const world = await withDesign(factory);
      const { repos, voter, design } = world;
      const cast = { userId: voter.id, designId: design.id, value: 1, reasons: [] } as const;
      await repos.votes.upsertVote(cast);
      await repos.votes.withdrawVote({ userId: voter.id, designId: design.id });
      const again = await repos.votes.upsertVote({ ...cast, value: -1 });
      expect(again).toMatchObject({ outcome: 'created', counts: { up: 0, down: 1 } });
    });

    it('rejects a withdraw on an unknown design', async () => {
      const { repos, voter } = await withDesign(factory);
      await expect(
        repos.votes.withdrawVote({ userId: voter.id, designId: 'nope' }),
      ).rejects.toMatchObject({ kind: 'missing-reference', reference: 'design nope' });
    });
  });
}

function editRaces(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the VoteRepository contract: parallel changes and withdraws`, () => {
    it('keeps the counters equal to the stored vote when changes and withdraws race', async () => {
      const world = await withDesign(factory);
      const { repos, voter, design } = world;
      const ids = { userId: voter.id, designId: design.id };
      await repos.votes.upsertVote({ ...ids, value: 1, reasons: [] });
      const steps = ['down', 'withdraw', 'up', 'withdraw', 'down', 'up', 'withdraw', 'down'];
      await Promise.all(
        steps.map((step) =>
          step === 'withdraw'
            ? repos.votes.withdrawVote(ids)
            : repos.votes.upsertVote({ ...ids, value: step === 'up' ? 1 : -1, reasons: [] }),
        ),
      );
      const stored = await repos.votes.listByUser(voter.id);
      expect(stored.length).toBeLessThanOrEqual(1);
      const value = stored[0]?.value;
      expect(await countsOf(world)).toEqual({
        up: value === 1 ? 1 : 0,
        down: value === -1 ? 1 : 0,
      });
    });
  });
}

/** Comment, reasons-only and withdraw behaviour every VoteRepository adapter must have. */
export function voteEditsContract(name: string, factory: RepositoriesFactory): void {
  comments(name, factory);
  withdrawals(name, factory);
  afterWithdraw(name, factory);
  editRaces(name, factory);
}
