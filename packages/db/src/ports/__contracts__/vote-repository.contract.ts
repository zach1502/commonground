import { describe, expect, it } from 'vitest';

import { MINUTE_MS, makeWorld, seedDraft, seedProject, seedUser, uncapped } from './fixtures.js';
import type { RepositoriesFactory } from './fixtures.js';
import { voteEditsContract } from './vote-edits.contract.js';

async function withDesign(factory: RepositoriesFactory) {
  const world = await makeWorld(factory);
  const author = await seedUser(world.repos, 'author');
  const voter = await seedUser(world.repos, 'voter');
  const project = await seedProject(world.repos);
  const design = await seedDraft(world.repos, project.id, author.id);
  await world.repos.designs.submit(design.id, uncapped({}));
  return { ...world, voter, project, design };
}

function voteWrites(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the VoteRepository contract: writes`, () => {
    it('creates a vote and counts it on the design', async () => {
      const { repos, voter, design } = await withDesign(factory);
      const cast = { userId: voter.id, designId: design.id, value: 1, reasons: ['shade'] } as const;
      const { vote, outcome, counts } = await repos.votes.upsertVote(cast);
      expect(outcome).toBe('created');
      expect(vote).toMatchObject({ ...cast, reasons: ['shade'] });
      expect(counts).toEqual({ up: 1, down: 0 });
      expect(await repos.designs.findById(design.id)).toMatchObject({ up: 1, down: 0 });
    });

    it('updates the same vote when the person votes again', async () => {
      const { repos, voter, design, clock } = await withDesign(factory);
      const first = await repos.votes.upsertVote({
        userId: voter.id,
        designId: design.id,
        value: 1,
        reasons: ['shade'],
      });
      clock.advance(MINUTE_MS);
      const second = await repos.votes.upsertVote({
        userId: voter.id,
        designId: design.id,
        value: -1,
        reasons: ['cost', 'access'],
      });
      expect(second.outcome).toBe('updated');
      expect(second.counts).toEqual({ up: 0, down: 1 });
      expect(second.vote.id).toBe(first.vote.id);
      expect(second.vote.reasons).toEqual(['cost', 'access']);
      expect(second.vote.createdAt).toEqual(first.vote.createdAt);
      expect(second.vote.updatedAt.getTime()).toBe(first.vote.updatedAt.getTime() + MINUTE_MS);
      expect(await repos.designs.findById(design.id)).toMatchObject({ up: 0, down: 1 });
      expect(await repos.votes.listByUser(voter.id)).toHaveLength(1);
    });

    it('leaves the counters alone when the value does not change', async () => {
      const { repos, voter, design } = await withDesign(factory);
      const cast = { userId: voter.id, designId: design.id, value: -1, reasons: [] } as const;
      await repos.votes.upsertVote(cast);
      await repos.votes.upsertVote(cast);
      expect(await repos.designs.findById(design.id)).toMatchObject({ up: 0, down: 1 });
    });
  });
}

function voteReads(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the VoteRepository contract: counts and reads`, () => {
    it('rejects a vote for an unknown design or person', async () => {
      const { repos, voter, design } = await withDesign(factory);
      const missingDesign = { userId: voter.id, designId: 'nope', value: 1, reasons: [] } as const;
      await expect(repos.votes.upsertVote(missingDesign)).rejects.toMatchObject({
        kind: 'missing-reference',
        reference: 'design nope',
      });
      const missingUser = { userId: 'nobody', designId: design.id, value: 1, reasons: [] } as const;
      await expect(repos.votes.upsertVote(missingUser)).rejects.toMatchObject({
        kind: 'missing-reference',
        reference: 'user nobody',
      });
    });

    it('totals votes and distinct voters for one project only', async () => {
      const { repos, voter, design, project } = await withDesign(factory);
      const second = await seedUser(repos, 'second');
      const otherProject = await seedProject(repos, 'Other');
      const otherDesign = await seedDraft(repos, otherProject.id, second.id);
      await repos.votes.upsertVote({
        userId: voter.id,
        designId: design.id,
        value: 1,
        reasons: [],
      });
      await repos.votes.upsertVote({
        userId: second.id,
        designId: design.id,
        value: -1,
        reasons: [],
      });
      await repos.votes.upsertVote({
        userId: voter.id,
        designId: otherDesign.id,
        value: 1,
        reasons: [],
      });
      expect(await repos.votes.totalsForProject(project.id)).toEqual({ votes: 2, uniqueVoters: 2 });
      expect(await repos.votes.totalsForProject('empty')).toEqual({ votes: 0, uniqueVoters: 0 });
      expect(await repos.votes.listByUser(voter.id)).toHaveLength(2);
      const listed = await repos.votes.listByProject(project.id);
      expect(listed.map((vote) => vote.userId).sort()).toEqual([second.id, voter.id].sort());
      expect(await repos.votes.listByProject('empty')).toEqual([]);
    });
  });
}

function voteRaces(name: string, factory: RepositoriesFactory): void {
  describe(`${name} meets the VoteRepository contract: parallel votes`, () => {
    it('counts votes from many people cast at once', async () => {
      const { repos, design } = await withDesign(factory);
      const ids = ['v1', 'v2', 'v3', 'v4'];
      await Promise.all(ids.map((id) => seedUser(repos, id)));
      await Promise.all(
        ids.map((userId) =>
          repos.votes.upsertVote({ userId, designId: design.id, value: 1, reasons: [] }),
        ),
      );
      expect(await repos.designs.findById(design.id)).toMatchObject({ up: ids.length });
    });

    it('keeps the counters equal to the stored vote when one person changes it at once', async () => {
      const { repos, voter, design } = await withDesign(factory);
      const values = [1, -1, 1, -1, 1, -1, -1, 1, 1, -1, 1] as const;
      const answers = await Promise.all(
        values.map((value) =>
          repos.votes.upsertVote({ userId: voter.id, designId: design.id, value, reasons: [] }),
        ),
      );
      const [stored] = await repos.votes.listByUser(voter.id);
      const counted = await repos.designs.findById(design.id);
      expect(await repos.votes.listByUser(voter.id)).toHaveLength(1);
      expect(answers.filter((answer) => answer.outcome === 'created')).toHaveLength(1);
      expect({ up: counted?.up, down: counted?.down }).toEqual(
        stored?.value === 1 ? { up: 1, down: 0 } : { up: 0, down: 1 },
      );
    });
  });
}

/** Behaviour every VoteRepository adapter must have. */
export function voteRepositoryContract(name: string, factory: RepositoriesFactory): void {
  voteWrites(name, factory);
  voteRaces(name, factory);
  voteReads(name, factory);
  voteEditsContract(name, factory);
}
