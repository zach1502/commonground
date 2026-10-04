import { countDistinct, count, eq } from 'drizzle-orm';

import type { RepositoryDeps, Vote } from '../../ports/records.js';
import type {
  CastVote,
  ProjectVoteTotals,
  UpsertedVote,
  VoteRepository,
  WithdrawVote,
  WithdrawnVote,
} from '../../ports/vote-repository.js';

import type { DrizzleDb } from './pglite.js';
import { designs, votes } from './schema/index.js';
import { upsertVoteStatements } from './vote-upsert.js';
import { withdrawVoteStatements } from './vote-withdraw.js';

export class DrizzleVoteRepository implements VoteRepository {
  constructor(
    private readonly db: DrizzleDb,
    private readonly deps: RepositoryDeps,
  ) {}

  /**
   * One statement for a first vote and two for a change, with no explicit transaction and no
   * lock held on the design between statements; see vote-upsert.ts for why the counters stay
   * exact under parallel votes.
   */
  upsertVote(input: CastVote): Promise<UpsertedVote> {
    return upsertVoteStatements(this.db, {
      input,
      id: this.deps.newId(),
      now: this.deps.clock.now(),
    });
  }

  /** One statement when there is a vote to remove; see vote-withdraw.ts. */
  withdrawVote(input: WithdrawVote): Promise<WithdrawnVote> {
    return withdrawVoteStatements(this.db, input, this.deps.clock.now());
  }

  listByUser(userId: string): Promise<Vote[]> {
    return this.db.select().from(votes).where(eq(votes.userId, userId));
  }

  async listByProject(projectId: string): Promise<Vote[]> {
    const rows = await this.db
      .select({ vote: votes })
      .from(votes)
      .innerJoin(designs, eq(designs.id, votes.designId))
      .where(eq(designs.projectId, projectId));
    return rows.map((row) => row.vote);
  }

  async totalsForProject(projectId: string): Promise<ProjectVoteTotals> {
    const [row] = await this.db
      .select({ votes: count(), uniqueVoters: countDistinct(votes.userId) })
      .from(votes)
      .innerJoin(designs, eq(designs.id, votes.designId))
      .where(eq(designs.projectId, projectId));
    return { votes: row?.votes ?? 0, uniqueVoters: row?.uniqueVoters ?? 0 };
  }
}
