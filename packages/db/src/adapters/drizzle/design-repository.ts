import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';

import type {
  DesignRepository,
  DraftChanges,
  DraftSaveResult,
  NewDesign,
  SubmitInput,
  SubmitResult,
} from '../../ports/design-repository.js';
import type {
  CreateDraftResult,
  CreateVersionResult,
  NewDraft,
  ThumbnailAttach,
  ThumbnailResult,
} from '../../ports/guarded-writes.js';
import type {
  Design,
  DesignStatus,
  DesignSummary,
  JsonObject,
  QueueCandidate,
  RepositoryDeps,
  VoteTarget,
} from '../../ports/records.js';
import { MissingReferenceError } from '../../ports/repositories.js';

import {
  attachThumbnail,
  insertGuardedDraft,
  supersedeIntoVersion,
  insertDraftRow,
  lockProjectPhase,
} from './guarded-writes.js';
import type { DrizzleDb } from './pglite.js';
import { designs, projects, users } from './schema/index.js';

// Every column but the document, which is most of a row and which summaries never read.
const summaryColumns = {
  id: designs.id,
  projectId: designs.projectId,
  authorId: designs.authorId,
  title: designs.title,
  blurb: designs.blurb,
  metrics: designs.metrics,
  status: designs.status,
  forkedFrom: designs.forkedFrom,
  versionOf: designs.versionOf,
  thumbnailRef: designs.thumbnailRef,
  up: designs.up,
  down: designs.down,
  createdAt: designs.createdAt,
  updatedAt: designs.updatedAt,
  submittedAt: designs.submittedAt,
} satisfies Record<keyof DesignSummary, unknown>;
const voteTargetProject = {
  id: projects.id,
  status: projects.status,
  closesAt: projects.closesAt,
  baselineDesignId: projects.baselineDesignId,
};
const listOrder = [
  desc(sql`coalesce(${designs.submittedAt}, ${designs.createdAt})`),
  desc(designs.id),
];

/** Built once per database: every vote runs it, and building an 18-column join costs more. */
function prepareVoteTarget(db: DrizzleDb) {
  return db
    .select({ design: summaryColumns, project: voteTargetProject })
    .from(designs)
    .innerJoin(projects, eq(projects.id, designs.projectId))
    .where(eq(designs.id, sql.placeholder('id')))
    .prepare('vote_target');
}

function inIdOrder(rows: readonly DesignSummary[], ids: readonly string[]): DesignSummary[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.flatMap((id) => {
    const row = byId.get(id);
    return row === undefined ? [] : [row];
  });
}

export class DrizzleDesignRepository implements DesignRepository {
  private preparedVoteTarget: ReturnType<typeof prepareVoteTarget> | undefined;

  constructor(
    private readonly db: DrizzleDb,
    private readonly deps: RepositoryDeps,
  ) {}

  create(input: NewDesign): Promise<Design> {
    return this.db.transaction(async (tx) => {
      const [project] = await tx
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.id, input.projectId));
      if (project === undefined) {
        throw new MissingReferenceError(`project ${input.projectId}`);
      }
      const [author] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.authorId));
      if (author === undefined) {
        throw new MissingReferenceError(`user ${input.authorId}`);
      }
      return insertDraftRow(tx, this.deps, { ...input, versionOf: null });
    });
  }

  createDraft(input: NewDraft): Promise<CreateDraftResult> {
    return insertGuardedDraft(this.db, this.deps, input);
  }

  async findById(id: string): Promise<Design | undefined> {
    const [design] = await this.db.select().from(designs).where(eq(designs.id, id));
    return design;
  }

  /**
   * One conditional UPDATE: it matches only a draft whose stamp still equals the one the caller
   * read, so of two saves from the same stamp exactly one writes. The read after a miss names
   * why, in the same transaction, so a rerun by the database gate answers the same way.
   */
  updateDraft(id: string, changes: DraftChanges): Promise<DraftSaveResult> {
    const { expectedUpdatedAt, ...fields } = changes;
    return this.db.transaction(async (tx): Promise<DraftSaveResult> => {
      const [target] = await tx
        .select({ projectId: designs.projectId, status: designs.status })
        .from(designs)
        .where(eq(designs.id, id));
      if (
        target?.status === 'draft' &&
        (await lockProjectPhase(tx, target.projectId, this.deps.clock)) !== 'open'
      ) {
        return { kind: 'phase-closed' };
      }
      const [design] = await tx
        .update(designs)
        .set({ ...fields, updatedAt: nextStamp(this.deps.clock.now()) })
        .where(and(eq(designs.id, id), eq(designs.status, 'draft'), stampIs(expectedUpdatedAt)))
        .returning();
      if (design !== undefined) return { kind: 'saved', design };
      const [current] = await tx.select().from(designs).where(eq(designs.id, id));
      return current?.status === 'draft' ? { kind: 'changed', current } : { kind: 'not-draft' };
    });
  }

  /**
   * Locks the author's user row first, so one author's submits run one after another and each
   * counts the live designs the others really left. A count outside this lock let five parallel
   * submits all see two live designs and all pass the cap of three. The final update also
   * requires the measured document, so a save that commits while this waits cannot go live
   * with metrics computed for the document it replaced. The project row is share-locked before
   * the user row, so a close that commits before this submit's write refuses it.
   */
  submit(id: string, { metrics, document, liveCap }: SubmitInput): Promise<SubmitResult> {
    return this.db.transaction(async (tx): Promise<SubmitResult> => {
      const [draft] = await tx
        .select({
          projectId: designs.projectId,
          authorId: designs.authorId,
          measured: sameDocument(document),
        })
        .from(designs)
        .where(and(eq(designs.id, id), eq(designs.status, 'draft')));
      if (draft === undefined) {
        return { kind: 'not-draft' };
      }
      if (!draft.measured) {
        return { kind: 'changed' };
      }
      if ((await lockProjectPhase(tx, draft.projectId, this.deps.clock)) !== 'open') {
        return { kind: 'phase-closed' };
      }
      await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, draft.authorId))
        .for('no key update');
      const live = await countWithStatus(tx, { ...draft, status: 'submitted' });
      if (live >= liveCap) {
        return { kind: 'live-cap-reached', live };
      }
      const changes = { metrics, status: 'submitted', submittedAt: this.deps.clock.now() } as const;
      const [design] = await tx
        .update(designs)
        .set(changes)
        .where(and(eq(designs.id, id), eq(designs.status, 'draft'), sameDocument(document)))
        .returning();
      return design === undefined ? whyNotSubmitted(tx, id) : { kind: 'submitted', design };
    });
  }

  createVersion(sourceId: string): Promise<CreateVersionResult> {
    return supersedeIntoVersion(this.db, this.deps, sourceId);
  }

  async findVersionOf(sourceId: string): Promise<Design | undefined> {
    const [successor] = await this.db.select().from(designs).where(eq(designs.versionOf, sourceId));
    return successor;
  }

  setThumbnail(id: string, input: ThumbnailAttach): Promise<ThumbnailResult> {
    return attachThumbnail(this.db, id, input);
  }

  listByProject(projectId: string, status: DesignStatus): Promise<Design[]> {
    return this.db
      .select()
      .from(designs)
      .where(and(eq(designs.projectId, projectId), eq(designs.status, status)))
      .orderBy(...listOrder);
  }

  listSummariesByProject(projectId: string, status: DesignStatus): Promise<DesignSummary[]> {
    return this.db
      .select(summaryColumns)
      .from(designs)
      .where(and(eq(designs.projectId, projectId), eq(designs.status, status)))
      .orderBy(...listOrder);
  }

  async findSummaryById(id: string): Promise<DesignSummary | undefined> {
    const [summary] = await this.db.select(summaryColumns).from(designs).where(eq(designs.id, id));
    return summary;
  }

  listQueueCandidates(projectId: string): Promise<QueueCandidate[]> {
    const candidate = {
      id: designs.id,
      authorId: designs.authorId,
      up: designs.up,
      down: designs.down,
    };
    return this.db
      .select(candidate)
      .from(designs)
      .where(and(eq(designs.projectId, projectId), eq(designs.status, 'submitted')))
      .orderBy(...listOrder);
  }

  async findSummariesByIds(ids: readonly string[]): Promise<DesignSummary[]> {
    if (ids.length === 0) return [];
    const rows = await this.db
      .select(summaryColumns)
      .from(designs)
      .where(inArray(designs.id, [...ids]));
    return inIdOrder(rows, ids);
  }

  async findVoteTarget(id: string): Promise<VoteTarget | undefined> {
    this.preparedVoteTarget ??= prepareVoteTarget(this.db);
    const [target] = await this.preparedVoteTarget.execute({ id });
    return target;
  }

  countByAuthor(projectId: string, authorId: string, status: DesignStatus): Promise<number> {
    return countWithStatus(this.db, { projectId, authorId, status });
  }
}

/** The clock's time, or 1 ms past the stored stamp when the clock has not moved past it. */
function nextStamp(now: Date) {
  return sql<Date>`greatest(${now.toISOString()}::timestamptz, ${designs.updatedAt} + interval '1 millisecond')`;
}

/** Matches any stamp when none is expected; otherwise only the expected one. */
function stampIs(expected: Date | undefined) {
  return expected === undefined ? undefined : eq(designs.updatedAt, expected);
}

/** True when the stored document equals the given one; jsonb equality ignores key order. */
function sameDocument(document: JsonObject) {
  return sql<boolean>`${designs.document} = ${JSON.stringify(document)}::jsonb`;
}

/** Names what stopped the final update: a submit that got there first, or a save. */
async function whyNotSubmitted(db: DrizzleDb, id: string): Promise<SubmitResult> {
  const [row] = await db.select({ status: designs.status }).from(designs).where(eq(designs.id, id));
  return row?.status === 'draft' ? { kind: 'changed' } : { kind: 'not-draft' };
}

interface AuthorDesigns {
  readonly projectId: string;
  readonly authorId: string;
  readonly status: DesignStatus;
}

async function countWithStatus(db: DrizzleDb, where: AuthorDesigns): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(designs)
    .where(
      and(
        eq(designs.projectId, where.projectId),
        eq(designs.authorId, where.authorId),
        eq(designs.status, where.status),
      ),
    );
  return row?.total ?? 0;
}
