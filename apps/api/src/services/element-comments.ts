import type { z } from '@hono/zod-openapi';

import type { Session } from '@parkshape/auth';
import {
  canEdit,
  catalogIndex,
  projectPhase,
  resolveAnchor,
  type AnchorError,
  type ElementComment,
} from '@parkshape/core';
import { PhaseClosedError, type Design, type Project } from '@parkshape/db';

import type {
  CommentRecord,
  DesignComments,
  newCommentSchema,
} from '../contracts/element-comments.js';
import type { AppDeps } from '../deps.js';
import { ApiError, notFound, wrongStatus } from '../errors.js';

import { loadProject, spendTokenOn, storedDocument, storedParcel } from './access.js';
import { authorNames, groupByElement, presentComment } from './element-comment-groups.js';

type NewComment = z.infer<typeof newCommentSchema>;

const ANCHOR_MESSAGES: Readonly<Record<AnchorError['kind'], string>> = {
  'unknown-element': 'This design has no element with that id. Pick an element on the design.',
  'point-off-element': 'The point is off the element. Tap on the path or area itself.',
};

export const commentingClosed = () =>
  new ApiError('phase-closed', 'Commenting closed on this project. Your comment was not sent.');

/**
 * The design and its project when the design takes or keeps comments: submitted, or superseded
 * by a newer version. A draft, the baseline and an unknown id all answer the same 404.
 */
async function loadCommentedDesign(
  deps: AppDeps,
  designId: string,
): Promise<{ readonly design: Design; readonly project: Project }> {
  const design = await deps.repos.designs.findById(designId);
  if (design === undefined || design.status === 'draft') throw notFound('Design');
  return { design, project: await loadProject(deps.repos, design.projectId) };
}

/** Runs a resident write, answering phase-closed when the project closed as it ran. */
async function whileCommentingOpen<T>(write: () => Promise<T>): Promise<T> {
  try {
    return await write();
  } catch (error) {
    if (error instanceof PhaseClosedError) throw commentingClosed();
    throw error;
  }
}

function assertCommentingOpen(deps: AppDeps, project: Project): void {
  if (projectPhase(project, deps.clock.now()) === 'closed') throw commentingClosed();
}

async function present(
  deps: AppDeps,
  comment: ElementComment,
  viewer: { readonly viewerId: string; readonly project: Project },
): Promise<CommentRecord> {
  const now = deps.clock.now();
  const names = await authorNames(deps.repos, [comment]);
  const phase = projectPhase(viewer.project, now);
  return presentComment(comment, { viewerId: viewer.viewerId, now, phase, names });
}

/** The design's comments grouped by element; hidden ones only for planners. */
export async function listDesignComments(
  deps: AppDeps,
  session: Session | undefined,
  designId: string,
): Promise<DesignComments> {
  const { design, project } = await loadCommentedDesign(deps, designId);
  const hidden = session?.role === 'staff' ? 'include' : 'exclude';
  const comments = await deps.repos.elementComments.listByDesign(design.id, { hidden });
  const now = deps.clock.now();
  const phase = projectPhase(project, now);
  const names = await authorNames(deps.repos, comments);
  const elements = groupByElement({
    document: storedDocument(design),
    parcel: storedParcel(project).polygon,
    comments,
    viewer: { viewerId: session?.userId, now, phase, names },
  });
  return { designId: design.id, commenting: phase, elements };
}

/**
 * Adds the caller's comment, or replaces the text of their open comment of the same kind on the
 * same element. The phase check here answers early; the repository checks it again inside the
 * write, so a close that lands after this check still refuses it. A refused try costs no token.
 */
export function createComment(
  deps: AppDeps,
  session: Session,
  request: { readonly designId: string; readonly body: NewComment },
) {
  return spendTokenOn(deps.limits.comments, session.userId, 'comments', async () => {
    const { design, project } = await loadCommentedDesign(deps, request.designId);
    if (design.status !== 'submitted') {
      throw wrongStatus('This version has a newer one. Comment on the newest version.');
    }
    assertCommentingOpen(deps, project);
    const { body } = request;
    const anchor = resolveAnchor(storedDocument(design), catalogIndex, body);
    if (!anchor.ok) {
      const message = ANCHOR_MESSAGES[anchor.error.kind];
      throw new ApiError('validation', message, { issues: [{ path: 'elementId', message }] });
    }
    const { comment, outcome } = await whileCommentingOpen(() =>
      deps.repos.elementComments.upsertOpen({
        designId: design.id,
        authorId: session.userId,
        elementId: body.elementId,
        ...anchor.value,
        kind: body.kind,
        text: body.text ?? '',
      }),
    );
    const viewer = { viewerId: session.userId, project };
    return { outcome, comment: await present(deps, comment, viewer) };
  });
}

/** The author's edit, while the project is open and within the edit window. */
export function editComment(
  deps: AppDeps,
  session: Session,
  request: { readonly commentId: string; readonly text: string },
) {
  return spendTokenOn(deps.limits.comments, session.userId, 'comments', async () => {
    const existing = await deps.repos.elementComments.findById(request.commentId);
    // Someone else's comment answers as a missing one, so ids reveal nothing.
    if (existing?.authorId !== session.userId) throw notFound('Comment');
    const { project } = await loadCommentedDesign(deps, existing.designId);
    assertCommentingOpen(deps, project);
    if (!canEdit(existing, session.userId, deps.clock.now())) {
      throw wrongStatus('You can edit a comment for 15 minutes after you add it. Add a new one.');
    }
    const change = await whileCommentingOpen(() => deps.repos.elementComments.edit(request));
    if (change.kind === 'missing') throw notFound('Comment');
    return { comment: await present(deps, change.comment, { viewerId: session.userId, project }) };
  });
}

type Moderation =
  | { readonly action: 'resolve'; readonly reply?: string | undefined }
  | { readonly action: 'hide'; readonly hidden: boolean };

/** A planner's resolve, reply or hide, in either phase. The route has checked the role. */
export async function moderateComment(
  deps: AppDeps,
  session: Session,
  request: { readonly commentId: string; readonly moderation: Moderation },
) {
  const { commentId, moderation } = request;
  const existing = await deps.repos.elementComments.findById(commentId);
  if (existing === undefined) throw notFound('Comment');
  const { project } = await loadCommentedDesign(deps, existing.designId);
  const comments = deps.repos.elementComments;
  const change =
    moderation.action === 'resolve'
      ? await comments.resolve({ commentId, reply: moderation.reply })
      : await comments.setHidden({ commentId, hidden: moderation.hidden });
  if (change.kind === 'missing') throw notFound('Comment');
  return { comment: await present(deps, change.comment, { viewerId: session.userId, project }) };
}
