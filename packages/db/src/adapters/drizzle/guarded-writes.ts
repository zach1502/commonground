import { and, eq } from 'drizzle-orm';

import { projectPhase, type Clock } from '@parkshape/core';

import type { NewDesign } from '../../ports/design-repository.js';
import type {
  CreateDraftResult,
  CreateVersionResult,
  DraftSource,
  NewDraft,
  ThumbnailAttach,
  ThumbnailResult,
} from '../../ports/guarded-writes.js';
import type { Design, JsonObject, RepositoryDeps } from '../../ports/records.js';
import { MissingReferenceError } from '../../ports/repositories.js';

import type { DrizzleDb } from './pglite.js';
import { designs, projects, users } from './schema/index.js';
import { firstRow } from './user-project-repositories.js';

export type DraftInsert = NewDesign & { readonly versionOf: string | null };
type ProjectPhaseNow = 'open' | 'closed' | 'missing';

export async function insertDraftRow(
  db: DrizzleDb,
  deps: RepositoryDeps,
  input: DraftInsert,
): Promise<Design> {
  const now = deps.clock.now();
  const [design] = await db
    .insert(designs)
    .values({ ...input, id: deps.newId(), status: 'draft', createdAt: now, updatedAt: now })
    .returning();
  return firstRow(design, 'designs insert');
}

/**
 * Takes a share lock on the project row for the rest of the transaction, then reads its phase on
 * the injected clock. A close is an UPDATE of that row, so it waits for this transaction, and a
 * close that committed first is what this read sees.
 */
export async function lockProjectPhase(
  tx: DrizzleDb,
  projectId: string,
  clock: Clock,
): Promise<ProjectPhaseNow> {
  const [project] = await tx
    .select({ status: projects.status, closesAt: projects.closesAt })
    .from(projects)
    .where(eq(projects.id, projectId))
    .for('share');
  if (project === undefined) return 'missing';
  return projectPhase(project, clock.now());
}

interface DraftContent {
  readonly document: JsonObject;
  readonly title: string;
  readonly forkedFrom: string | null;
}

type Refusal = Extract<CreateDraftResult, { kind: 'source-not-live' | 'no-baseline' }>;

/** The source as it stands inside the transaction; a fork source is share-locked until commit. */
async function draftContent(
  tx: DrizzleDb,
  projectId: string,
  source: DraftSource,
): Promise<DraftContent | Refusal> {
  if (source.from === 'document') return { ...source, forkedFrom: null };
  const content = { id: designs.id, title: designs.title, document: designs.document };
  if (source.from === 'fork') {
    const [live] = await tx
      .select(content)
      .from(designs)
      .where(
        and(
          eq(designs.id, source.designId),
          eq(designs.projectId, projectId),
          eq(designs.status, 'submitted'),
        ),
      )
      .for('share');
    return live === undefined ? { kind: 'source-not-live' } : { ...live, forkedFrom: live.id };
  }
  const [baseline] = await tx
    .select(content)
    .from(projects)
    .innerJoin(designs, eq(designs.id, projects.baselineDesignId))
    .where(eq(projects.id, projectId));
  return baseline === undefined ? { kind: 'no-baseline' } : { ...baseline, forkedFrom: null };
}

export function insertGuardedDraft(
  db: DrizzleDb,
  deps: RepositoryDeps,
  input: NewDraft,
): Promise<CreateDraftResult> {
  return db.transaction(async (tx): Promise<CreateDraftResult> => {
    const phase = await lockProjectPhase(tx, input.projectId, deps.clock);
    if (phase === 'missing') throw new MissingReferenceError(`project ${input.projectId}`);
    if (phase === 'closed') return { kind: 'phase-closed' };
    const [author] = await tx
      .select({ id: users.id })
      .from(users)
      .where(eq(users.id, input.authorId));
    if (author === undefined) throw new MissingReferenceError(`user ${input.authorId}`);
    const content = await draftContent(tx, input.projectId, input.source);
    if ('kind' in content) return content;
    const design = await insertDraftRow(tx, deps, {
      projectId: input.projectId,
      authorId: input.authorId,
      title: input.title ?? content.title,
      blurb: '',
      document: content.document,
      forkedFrom: content.forkedFrom,
      versionOf: null,
    });
    return { kind: 'created', design };
  });
}

/** Supersedes the source only if it is still live, and inserts its copy, in one transaction. */
export function supersedeIntoVersion(
  db: DrizzleDb,
  deps: RepositoryDeps,
  sourceId: string,
): Promise<CreateVersionResult> {
  return db.transaction(async (tx): Promise<CreateVersionResult> => {
    const [found] = await tx
      .select({ projectId: designs.projectId })
      .from(designs)
      .where(eq(designs.id, sourceId));
    if (found === undefined) return { kind: 'not-submitted' };
    if ((await lockProjectPhase(tx, found.projectId, deps.clock)) !== 'open') {
      return { kind: 'phase-closed' };
    }
    const [source] = await tx
      .update(designs)
      .set({ status: 'superseded' })
      .where(and(eq(designs.id, sourceId), eq(designs.status, 'submitted')))
      .returning();
    if (source === undefined) return { kind: 'not-submitted' };
    const { projectId, authorId, title, blurb, document, forkedFrom } = source;
    const design = await insertDraftRow(tx, deps, {
      ...{ projectId, authorId, title, blurb, document, forkedFrom },
      versionOf: source.id,
    });
    return { kind: 'created', design };
  });
}

/** Attaches the key only while the stamp is the one the picture was taken at. */
export function attachThumbnail(
  db: DrizzleDb,
  id: string,
  { thumbnailRef, expectedUpdatedAt }: ThumbnailAttach,
): Promise<ThumbnailResult> {
  return db.transaction(async (tx): Promise<ThumbnailResult> => {
    const [design] = await tx
      .update(designs)
      .set({ thumbnailRef })
      .where(and(eq(designs.id, id), eq(designs.updatedAt, expectedUpdatedAt)))
      .returning();
    if (design !== undefined) return { kind: 'attached', design };
    const [current] = await tx.select({ id: designs.id }).from(designs).where(eq(designs.id, id));
    return current === undefined ? { kind: 'missing' } : { kind: 'changed' };
  });
}
