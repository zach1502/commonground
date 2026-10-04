import type { RepositoryDeps, Vote } from '../../ports/records.js';
import { MissingReferenceError, PhaseClosedError } from '../../ports/repositories.js';
import type {
  CastVote,
  ProjectVoteTotals,
  UpsertedVote,
  VoteRepository,
  WithdrawVote,
  WithdrawnVote,
} from '../../ports/vote-repository.js';

import { projectOpenNow } from './guarded-writes.js';
import type { InMemoryStore } from './store.js';

function counterDelta(previous: Vote | undefined, next: CastVote) {
  const up = (next.value === 1 ? 1 : 0) - (previous?.value === 1 ? 1 : 0);
  const down = (next.value === -1 ? 1 : 0) - (previous?.value === -1 ? 1 : 0);
  return { up, down };
}

export class InMemoryVoteRepository implements VoteRepository {
  constructor(
    private readonly store: InMemoryStore,
    private readonly deps: RepositoryDeps,
  ) {}

  // Runs without awaiting, so no other call can interleave: the in-memory form of a transaction.
  upsertVote(input: CastVote): Promise<UpsertedVote> {
    if (!this.store.users.has(input.userId)) {
      return Promise.reject(new MissingReferenceError(`user ${input.userId}`));
    }
    const design = this.openDesign(input.designId);
    if (design instanceof Error) return Promise.reject(design);
    const previous = this.findVote(input.userId, input.designId);
    const now = this.deps.clock.now();
    const vote: Vote = {
      id: previous?.id ?? this.deps.newId(),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
      userId: input.userId,
      designId: input.designId,
      value: input.value,
      reasons: [...input.reasons],
      comment: input.comment ?? null,
    };
    const delta = counterDelta(previous, input);
    this.store.votes.set(vote.id, vote);
    const counts = { up: design.up + delta.up, down: design.down + delta.down };
    this.store.designs.set(design.id, { ...design, ...counts });
    const outcome = previous === undefined ? 'created' : 'updated';
    return Promise.resolve({ vote, outcome, counts });
  }

  // Runs without awaiting, like upsertVote, so the delete and the counters move together.
  withdrawVote(input: WithdrawVote): Promise<WithdrawnVote> {
    const design = this.openDesign(input.designId);
    if (design instanceof Error) return Promise.reject(design);
    const previous = this.findVote(input.userId, input.designId);
    if (previous === undefined) {
      return Promise.resolve({ outcome: 'absent', counts: { up: design.up, down: design.down } });
    }
    this.store.votes.delete(previous.id);
    const counts = {
      up: design.up - (previous.value === 1 ? 1 : 0),
      down: design.down - (previous.value === -1 ? 1 : 0),
    };
    this.store.designs.set(design.id, { ...design, ...counts });
    return Promise.resolve({ outcome: 'withdrawn', counts });
  }

  listByUser(userId: string): Promise<Vote[]> {
    return Promise.resolve([...this.store.votes.values()].filter((vote) => vote.userId === userId));
  }

  listByProject(projectId: string): Promise<Vote[]> {
    return Promise.resolve(
      [...this.store.votes.values()].filter(
        (vote) => this.store.designs.get(vote.designId)?.projectId === projectId,
      ),
    );
  }

  async totalsForProject(projectId: string): Promise<ProjectVoteTotals> {
    const votes = await this.listByProject(projectId);
    return {
      votes: votes.length,
      uniqueVoters: new Set(votes.map((vote) => vote.userId)).size,
    };
  }

  /** The design while its project is open, or the error a vote on it answers. */
  private openDesign(designId: string) {
    const design = this.store.designs.get(designId);
    if (design === undefined) return new MissingReferenceError(`design ${designId}`);
    if (!projectOpenNow(this.store, design.projectId, this.deps.clock)) {
      return new PhaseClosedError(`design ${designId}`);
    }
    return design;
  }

  private findVote(userId: string, designId: string): Vote | undefined {
    return [...this.store.votes.values()].find(
      (vote) => vote.userId === userId && vote.designId === designId,
    );
  }
}
