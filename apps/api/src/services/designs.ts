import type { z } from '@hono/zod-openapi';

import type { Session } from '@parkshape/auth';
import { MAX_LIVE_SUBMISSIONS, designDocumentSchema, type DesignDocument } from '@parkshape/core';
import type { CreateDraftResult, Design, DraftSource, Project, SubmitResult } from '@parkshape/db';

import type { createDesignBodySchema, saveDraftBodySchema } from '../contracts/projects-designs.js';
import type { AppDeps } from '../deps.js';
import {
  ApiError,
  forbidden,
  fromBlobStore,
  notFound,
  phaseClosed,
  wrongStatus,
} from '../errors.js';
import {
  hardFailuresFrom,
  loadProjectTerrain,
  measureSubmission,
  softWarningsFrom,
  type HardFailure,
  type SoftWarning,
  type SubmissionMetrics,
} from '../rules/index.js';

import {
  assertOpen,
  loadProject,
  loadVisibleDesign,
  storedBaseline,
  storedDocument,
  storedParameters,
  spendTokenOn,
  storedParcel,
} from './access.js';
import { describedDocument } from './describe.js';
import { boardChanged } from './leaderboard.js';
import { thumbnailUpload } from './thumbnail-upload.js';

type CreateDesignBody = z.infer<typeof createDesignBodySchema>;
type SaveDraftBody = z.infer<typeof saveDraftBodySchema>;

const UNTITLED = 'Untitled design';

/** An empty park: what a "start from blank" draft holds. */
export const BLANK_DOCUMENT: DesignDocument = designDocumentSchema.parse({
  version: 1,
  items: [],
  paths: [],
  areas: [],
  gradeDelta: { cells: [] },
  zones: [],
});

const FORK_NOT_LIVE = 'Only submitted designs can be forked.';

/**
 * Checks a fork or baseline source as the caller sees it, for clear errors. The repository copies
 * the source inside the insert and checks it again there, so a source superseded after this
 * read is refused and never copied.
 */
async function draftSource(
  deps: AppDeps,
  session: Session,
  project: Project,
  body: CreateDesignBody,
): Promise<DraftSource> {
  if (body.from === 'blank' || body.from === 'describe') {
    return documentSource(deps, project, body);
  }
  const sourceId = sourceIdOf(project, body);
  // Someone else's draft does not exist for this caller, so forking one reads as not found.
  const source = await loadVisibleDesign(deps.repos, sourceId, session.userId);
  if (source.projectId !== project.id) {
    throw notFound('Design');
  }
  if (body.from === 'fork' && source.status !== 'submitted') {
    throw wrongStatus(FORK_NOT_LIVE);
  }
  return body.from === 'fork' ? { from: 'fork', designId: source.id } : { from: 'baseline' };
}

function sourceIdOf(project: Project, body: CreateDesignBody): string {
  const sourceId = body.from === 'fork' ? body.sourceDesignId : project.baselineDesignId;
  if (sourceId !== undefined && sourceId !== null) return sourceId;
  throw body.from === 'fork'
    ? new ApiError('validation', 'Give sourceDesignId to fork a design.')
    : notFound('Baseline design');
}

async function documentSource(
  deps: AppDeps,
  project: Project,
  body: CreateDesignBody,
): Promise<DraftSource> {
  const document =
    body.from === 'blank' ? BLANK_DOCUMENT : await describedDocument(deps, project, body);
  return { from: 'document', document, title: UNTITLED };
}

function createdDraft(result: CreateDraftResult): Design {
  switch (result.kind) {
    case 'created':
      return result.design;
    case 'phase-closed':
      throw phaseClosed();
    case 'source-not-live':
      throw wrongStatus(FORK_NOT_LIVE);
    default:
      throw notFound('Baseline design');
  }
}

/** The phase guard here gives an early answer; the repository checks it again in the insert. */
export async function createDraft(
  deps: AppDeps,
  session: Session,
  projectId: string,
  body: CreateDesignBody,
): Promise<Design> {
  const project = await loadProject(deps.repos, projectId);
  assertOpen(project, deps.clock);
  const source = await draftSource(deps, session, project, body);
  const created = await deps.repos.designs.createDraft({
    projectId,
    authorId: session.userId,
    title: body.title,
    source,
  });
  return createdDraft(created);
}

/**
 * The caller's own design. Another person's draft is not found, the same answer as a random id,
 * so the answer never tells whether a private draft exists; a public design they did not write
 * is forbidden.
 */
async function loadOwnDesign(deps: AppDeps, session: Session, id: string): Promise<Design> {
  const design = await loadVisibleDesign(deps.repos, id, session.userId);
  if (design.authorId !== session.userId) {
    throw forbidden('Only the author can change this design.');
  }
  return design;
}

function requireStatus(design: Design, status: Design['status'], message: string): void {
  if (design.status !== status) {
    throw wrongStatus(message);
  }
}

/** A save that went through, or the stored draft that a newer save left in its place. */
export type DraftSave =
  | { readonly kind: 'saved'; readonly design: Design }
  | { readonly kind: 'changed'; readonly current: Design };

export async function saveDraft(
  deps: AppDeps,
  session: Session,
  id: string,
  body: SaveDraftBody,
): Promise<DraftSave> {
  const design = await loadOwnDesign(deps, session, id);
  requireStatus(design, 'draft', 'Only drafts can be edited. Make a new version instead.');
  const { expectedUpdatedAt, ...changes } = body;
  const result = await deps.repos.designs.updateDraft(id, {
    ...changes,
    ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt: new Date(expectedUpdatedAt) }),
  });
  if (result.kind === 'phase-closed') {
    throw phaseClosed();
  }
  if (result.kind === 'not-draft') {
    throw wrongStatus('This draft was submitted while you were editing it.');
  }
  return result;
}

/** What a submit produced: the design's new status, its metrics, and any failures or warnings. */
export interface SubmitOutcome {
  readonly status: Design['status'];
  readonly metrics: SubmissionMetrics;
  readonly hardFailures: HardFailure[];
  readonly softWarnings: SoftWarning[];
  /** True while the design has no stored thumbnail; the client uploads one, and retries on 503. */
  readonly thumbnailPending: boolean;
}

/**
 * Recomputes metrics on the server (never trusting the client's). A broken hard constraint blocks
 * the submit and the design stays a draft; the live cap is a separate 422. Soft misses come back
 * as warnings for the caller to badge. The submissions token is taken only once the metrics pass,
 * so a blocked try costs nothing, and it goes back when the write answers an error. The request
 * body limit and the metrics worker timeout bound the measuring itself.
 */
export async function submitDesign(
  deps: AppDeps,
  session: Session,
  id: string,
): Promise<SubmitOutcome> {
  const design = await loadOwnDesign(deps, session, id);
  requireStatus(design, 'draft', 'This design was already submitted.');
  const project = await loadProject(deps.repos, design.projectId);
  assertOpen(project, deps.clock);
  const measured = await measureDesign(deps, design, project);
  if (measured.hardFailures.length > 0) return measured;
  return spendTokenOn(deps.limits.submissions, session.userId, 'submissions', () =>
    writeSubmission(deps, design, measured),
  );
}

async function measureDesign(
  deps: AppDeps,
  design: Design,
  project: Project,
): Promise<SubmitOutcome> {
  const parcel = storedParcel(project);
  const metrics = await measureSubmission(deps.metrics, {
    document: storedDocument(design),
    baseline: await storedBaseline(deps.repos, project),
    parameters: storedParameters(project),
    parcel,
    terrain: await loadProjectTerrain(deps.blobStore, project, parcel),
  });
  return {
    status: design.status,
    metrics,
    hardFailures: hardFailuresFrom(metrics.constraints),
    softWarnings: softWarningsFrom(metrics.constraints),
    thumbnailPending: design.thumbnailRef === null,
  };
}

async function writeSubmission(
  deps: AppDeps,
  design: Design,
  measured: SubmitOutcome,
): Promise<SubmitOutcome> {
  // The stored document as read, so a save that lands while the metrics run blocks the submit.
  const submitted = await deps.repos.designs.submit(design.id, {
    metrics: { ...measured.metrics },
    document: design.document,
    liveCap: MAX_LIVE_SUBMISSIONS,
  });
  const live = submittedDesign(submitted);
  boardChanged(deps, design.projectId);
  return { ...measured, status: live.status };
}

function submittedDesign(result: SubmitResult): Design {
  switch (result.kind) {
    case 'submitted':
      return result.design;
    case 'live-cap-reached':
      throw liveCapReached();
    case 'not-draft':
      throw wrongStatus('This design was already submitted.');
    case 'changed':
      throw wrongStatus('This draft changed while it was being checked. Submit it again.');
    default:
      throw phaseClosed();
  }
}

function liveCapReached(): ApiError {
  const limit = String(MAX_LIVE_SUBMISSIONS);
  const message = `You have ${limit} live designs, the most allowed. Make a new version instead.`;
  return new ApiError('liveCapReached', message);
}

/**
 * Stores the author's captured thumbnail, WebP or PNG, in two steps. The blob goes under a key
 * named by its own bytes, so a put never overwrites a picture another request attached. The row
 * then takes the key only while the design keeps the stamp it had when this request read it: a
 * save in between means the picture shows a document the design no longer has, and it is
 * refused. An unattached blob is never referenced; the store has no delete, so it stays unused.
 */
export async function setThumbnail(
  deps: AppDeps,
  session: Session,
  id: string,
  imageBase64: string,
): Promise<Design> {
  const design = await loadOwnDesign(deps, session, id);
  const upload = thumbnailUpload(design.id, imageBase64);
  await fromBlobStore(() => deps.blobStore.put(upload.key, upload.bytes, upload.contentType));
  const stored = await deps.repos.designs.setThumbnail(design.id, {
    thumbnailRef: upload.key,
    expectedUpdatedAt: design.updatedAt,
  });
  if (stored.kind === 'missing') throw notFound('Design');
  if (stored.kind === 'changed') {
    throw wrongStatus('This draft changed while the picture was uploading. Take it again.');
  }
  return stored.design;
}

export async function versionDesign(deps: AppDeps, session: Session, id: string): Promise<Design> {
  const design = await loadOwnDesign(deps, session, id);
  requireStatus(design, 'submitted', 'Only submitted designs can get a new version.');
  assertOpen(await loadProject(deps.repos, design.projectId), deps.clock);
  const version = await deps.repos.designs.createVersion(id);
  if (version.kind === 'phase-closed') throw phaseClosed();
  if (version.kind === 'not-submitted') {
    throw wrongStatus('This design already has a newer version.');
  }
  boardChanged(deps, design.projectId);
  return version.design;
}
