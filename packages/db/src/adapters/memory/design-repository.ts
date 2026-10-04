import { isDeepStrictEqual } from 'node:util';

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
  QueueCandidate,
  RepositoryDeps,
  VoteTarget,
} from '../../ports/records.js';
import { MissingReferenceError } from '../../ports/repositories.js';

import { draftContent, projectOpenNow } from './guarded-writes.js';
import { byDateThenId, type InMemoryStore } from './store.js';

function summaryOf(design: Design): DesignSummary {
  const { id, projectId, authorId, title, blurb, metrics, status } = design;
  const { forkedFrom, versionOf, thumbnailRef, up, down, createdAt, updatedAt } = design;
  const summary = { id, projectId, authorId, title, blurb, metrics, status, forkedFrom };
  const stamps = { createdAt, updatedAt, submittedAt: design.submittedAt };
  return { ...summary, versionOf, thumbnailRef, up, down, ...stamps };
}

/** The clock's time, or 1 ms past the last stamp when the clock has not moved past it. */
function nextStamp(previous: Date, now: Date): Date {
  return new Date(Math.max(now.getTime(), previous.getTime() + 1));
}

export class InMemoryDesignRepository implements DesignRepository {
  constructor(
    private readonly store: InMemoryStore,
    private readonly deps: RepositoryDeps,
  ) {}

  create(input: NewDesign): Promise<Design> {
    if (!this.store.projects.has(input.projectId)) {
      return Promise.reject(new MissingReferenceError(`project ${input.projectId}`));
    }
    if (!this.store.users.has(input.authorId)) {
      return Promise.reject(new MissingReferenceError(`user ${input.authorId}`));
    }
    return Promise.resolve(this.insertDraft({ ...input, versionOf: null }));
  }

  createDraft(input: NewDraft): Promise<CreateDraftResult> {
    try {
      const content = draftContent(this.store, this.deps.clock, input);
      if ('kind' in content) return Promise.resolve(content);
      const { projectId, authorId } = input;
      const title = input.title ?? content.title;
      const draft = { projectId, authorId, title, blurb: '', versionOf: null };
      const design = this.insertDraft({ ...draft, ...content, title });
      return Promise.resolve({ kind: 'created', design });
    } catch (error) {
      return Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
  }

  findById(id: string): Promise<Design | undefined> {
    return Promise.resolve(this.store.designs.get(id));
  }

  /** Checks the stamp and writes with no await between them, as one conditional UPDATE does. */
  updateDraft(id: string, changes: DraftChanges): Promise<DraftSaveResult> {
    const { expectedUpdatedAt, ...fields } = changes;
    const current = this.store.designs.get(id);
    if (current?.status !== 'draft') {
      return Promise.resolve({ kind: 'not-draft' });
    }
    if (!projectOpenNow(this.store, current.projectId, this.deps.clock)) {
      return Promise.resolve({ kind: 'phase-closed' });
    }
    if (
      expectedUpdatedAt !== undefined &&
      expectedUpdatedAt.getTime() !== current.updatedAt.getTime()
    ) {
      return Promise.resolve({ kind: 'changed', current });
    }
    const design = {
      ...current,
      ...fields,
      updatedAt: nextStamp(current.updatedAt, this.deps.clock.now()),
    };
    this.store.designs.set(id, design);
    return Promise.resolve({ kind: 'saved', design });
  }

  /** Counts and writes with no await between them, so no other submit can run in the gap. */
  submit(id: string, { metrics, document, liveCap }: SubmitInput): Promise<SubmitResult> {
    const draft = this.store.designs.get(id);
    if (draft?.status !== 'draft') {
      return Promise.resolve({ kind: 'not-draft' });
    }
    // Compares by value and ignores key order, as a jsonb comparison in Postgres does.
    if (!isDeepStrictEqual(draft.document, document)) {
      return Promise.resolve({ kind: 'changed' });
    }
    if (!projectOpenNow(this.store, draft.projectId, this.deps.clock)) {
      return Promise.resolve({ kind: 'phase-closed' });
    }
    const live = this.liveCount(draft.projectId, draft.authorId, 'submitted');
    if (live >= liveCap) {
      return Promise.resolve({ kind: 'live-cap-reached', live });
    }
    const design: Design = {
      ...draft,
      metrics,
      status: 'submitted',
      submittedAt: this.deps.clock.now(),
    };
    this.store.designs.set(id, design);
    return Promise.resolve({ kind: 'submitted', design });
  }

  createVersion(sourceId: string): Promise<CreateVersionResult> {
    const found = this.store.designs.get(sourceId);
    if (found === undefined) return Promise.resolve({ kind: 'not-submitted' });
    if (!projectOpenNow(this.store, found.projectId, this.deps.clock)) {
      return Promise.resolve({ kind: 'phase-closed' });
    }
    const source = this.patchWithStatus(sourceId, 'submitted', { status: 'superseded' });
    if (source === undefined) {
      return Promise.resolve({ kind: 'not-submitted' });
    }
    const { projectId, authorId, title, blurb, document, forkedFrom } = source;
    const version = this.insertDraft({
      projectId,
      authorId,
      title,
      blurb,
      document,
      forkedFrom,
      versionOf: source.id,
    });
    return Promise.resolve({ kind: 'created', design: version });
  }

  findVersionOf(sourceId: string): Promise<Design | undefined> {
    const successor = [...this.store.designs.values()].find(
      (design) => design.versionOf === sourceId,
    );
    return Promise.resolve(successor);
  }

  setThumbnail(id: string, input: ThumbnailAttach): Promise<ThumbnailResult> {
    const existing = this.store.designs.get(id);
    if (existing === undefined) {
      return Promise.resolve({ kind: 'missing' });
    }
    if (existing.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) {
      return Promise.resolve({ kind: 'changed' });
    }
    const design = { ...existing, thumbnailRef: input.thumbnailRef };
    this.store.designs.set(id, design);
    return Promise.resolve({ kind: 'attached', design });
  }

  listByProject(projectId: string, status: DesignStatus): Promise<Design[]> {
    const designs = [...this.store.designs.values()].filter(
      (design) => design.projectId === projectId && design.status === status,
    );
    return Promise.resolve(
      designs.sort(byDateThenId((design) => design.submittedAt ?? design.createdAt, 'desc')),
    );
  }

  async listSummariesByProject(projectId: string, status: DesignStatus): Promise<DesignSummary[]> {
    return (await this.listByProject(projectId, status)).map(summaryOf);
  }

  async findSummaryById(id: string): Promise<DesignSummary | undefined> {
    const design = await this.findById(id);
    return design === undefined ? undefined : summaryOf(design);
  }

  async listQueueCandidates(projectId: string): Promise<QueueCandidate[]> {
    const live = await this.listByProject(projectId, 'submitted');
    return live.map(({ id, authorId, up, down }) => ({ id, authorId, up, down }));
  }

  findSummariesByIds(ids: readonly string[]): Promise<DesignSummary[]> {
    return Promise.resolve(
      ids.flatMap((id) => {
        const design = this.store.designs.get(id);
        return design === undefined ? [] : [summaryOf(design)];
      }),
    );
  }

  async findVoteTarget(id: string): Promise<VoteTarget | undefined> {
    const design = await this.findById(id);
    const project = design === undefined ? undefined : this.store.projects.get(design.projectId);
    if (design === undefined || project === undefined) return undefined;
    const { status, closesAt, baselineDesignId } = project;
    return {
      design: summaryOf(design),
      project: { id: project.id, status, closesAt, baselineDesignId },
    };
  }

  countByAuthor(projectId: string, authorId: string, status: DesignStatus): Promise<number> {
    return Promise.resolve(this.liveCount(projectId, authorId, status));
  }

  private liveCount(projectId: string, authorId: string, status: DesignStatus): number {
    return [...this.store.designs.values()].filter(
      (design) =>
        design.projectId === projectId && design.authorId === authorId && design.status === status,
    ).length;
  }

  private insertDraft(input: NewDesign & { readonly versionOf: string | null }): Design {
    const now = this.deps.clock.now();
    const design: Design = {
      ...input,
      id: this.deps.newId(),
      metrics: null,
      status: 'draft',
      thumbnailRef: null,
      up: 0,
      down: 0,
      createdAt: now,
      updatedAt: now,
      submittedAt: null,
    };
    this.store.designs.set(design.id, design);
    return design;
  }

  private patchWithStatus(
    id: string,
    required: DesignStatus,
    changes: Partial<Design>,
  ): Design | undefined {
    const existing = this.store.designs.get(id);
    if (existing?.status !== required) {
      return undefined;
    }
    const design = { ...existing, ...changes };
    this.store.designs.set(id, design);
    return design;
  }
}
