import type { DesignDocumentInput } from '@parkshape/core';

import { designSchema } from '../src/contracts/projects-designs.js';

import { BLANK, GARDEN, createDraft, createProject } from './fixtures.js';
import {
  BOB,
  KEVIN,
  MOLLY,
  SALLY,
  STAFF,
  startHarness,
  type CallResult,
  type Harness,
} from './harness.js';

/** The two stores every element comment test runs on. */
export const STORES = ['database', 'memory'] as const;
export type Store = (typeof STORES)[number];

// Starting pglite and running the migrations can pass the 10 s hook default under load.
export const WORLD_START_TIMEOUT_MS = 60_000;

export const BENCH_ID = 'bench-1';
export const WALK_ID = 'walk-1';
export const GARDEN_ID = 'garden-1';

/** The garden design with a bench and a gravel walk, so each element kind has one. */
export const REVIEWABLE: DesignDocumentInput = {
  ...GARDEN,
  items: [
    {
      id: BENCH_ID,
      catalogId: 'bench',
      position: { x: 30, y: 30 },
      rotationDeg: 0,
      locked: false,
    },
  ],
  paths: [
    {
      id: WALK_ID,
      surface: 'gravel',
      widthM: 2,
      points: [
        { x: 40, y: 60 },
        { x: 90, y: 60 },
      ],
    },
  ],
};

// High enough that only the rate limit test meets the comment bucket.
const GENEROUS = '100000';

export interface CommentBody {
  readonly elementId: string;
  readonly kind: string;
  readonly text?: string;
  readonly surfacePoint?: { readonly x: number; readonly y: number };
}

export interface CommentVisibilityBody {
  readonly hidden: boolean;
}

/** The planner's Hide. */
export const HIDE: CommentVisibilityBody = { hidden: true };

export interface ReviewTarget {
  readonly projectId: string;
  readonly designId: string;
  readonly baselineId: string;
}

export interface CommentWorld {
  readonly h: Harness;
  cookie(persona: string): string;
  /** A new open project with BOB's submitted design and a draft of his. */
  freshTarget(): Promise<ReviewTarget & { readonly draftId: string }>;
  list(designId: string, persona?: string): Promise<CallResult>;
  post(persona: string | undefined, designId: string, body: CommentBody): Promise<CallResult>;
  patch(persona: string | undefined, commentId: string, text: string): Promise<CallResult>;
  resolve(persona: string | undefined, commentId: string, reply?: string): Promise<CallResult>;
  hide(
    persona: string | undefined,
    commentId: string,
    change: CommentVisibilityBody,
  ): Promise<CallResult>;
  close(projectId: string): Promise<void>;
}

/** Submits a document as BOB and answers the design id. */
export async function submitAs(
  h: Harness,
  cookie: string,
  projectId: string,
  document: DesignDocumentInput,
): Promise<string> {
  const draft = await createDraft(h, cookie, projectId);
  const body = { title: 'Bench walk', blurb: 'A bench by the walk.', document };
  await h.call('PUT', `/designs/${draft.id}`, { cookie, body });
  const submitted = await h.call('POST', `/designs/${draft.id}/submit`, { cookie });
  if (submitted.status !== 200) throw new Error(`submit answered ${String(submitted.status)}`);
  return designSchema.parse((await h.call('GET', `/designs/${draft.id}`, { cookie })).body).id;
}

function withCookie(cookie: string | undefined) {
  return cookie === undefined || cookie === '' ? {} : { cookie };
}

export async function startCommentWorld(
  store: Store,
  env: Record<string, string> = {},
): Promise<CommentWorld> {
  const h = await startHarness(
    {
      RATE_LIMIT_SUBMISSIONS_PER_HOUR: GENEROUS,
      RATE_LIMIT_COMMENTS_PER_MINUTE: GENEROUS,
      ...env,
    },
    { store },
  );
  const cookies = new Map<string, string>();
  for (const persona of [STAFF, BOB, MOLLY, KEVIN, SALLY]) {
    cookies.set(persona, await h.login(persona));
  }
  const cookie = (persona: string) => cookies.get(persona) ?? '';
  const as = (persona: string | undefined) =>
    withCookie(persona === undefined ? undefined : cookie(persona));
  return {
    h,
    cookie,
    freshTarget: async () => {
      const project = await createProject(h, cookie(STAFF), { baselineDocument: BLANK });
      const designId = await submitAs(h, cookie(BOB), project.id, REVIEWABLE);
      const draft = await createDraft(h, cookie(BOB), project.id);
      const baselineId = project.baselineDesignId ?? '';
      return { projectId: project.id, designId, draftId: draft.id, baselineId };
    },
    list: (designId, persona) => h.call('GET', `/designs/${designId}/comments`, as(persona)),
    post: (persona, designId, body) =>
      h.call('POST', `/designs/${designId}/comments`, { ...as(persona), body }),
    patch: (persona, commentId, text) =>
      h.call('PATCH', `/comments/${commentId}`, { ...as(persona), body: { text } }),
    resolve: (persona, commentId, reply) =>
      h.call('POST', `/comments/${commentId}/resolve`, {
        ...as(persona),
        body: reply === undefined ? {} : { reply },
      }),
    hide: (persona, commentId, change) =>
      h.call('POST', `/comments/${commentId}/hide`, { ...as(persona), body: change }),
    close: async (projectId) => {
      const body = { status: 'closed' };
      await h.call('PATCH', `/projects/${projectId}/status`, { cookie: cookie(STAFF), body });
    },
  };
}

/** The comment id in a create or edit answer. */
export function commentIdOf(response: CallResult): string {
  const body = response.body as { comment?: { id?: string } } | undefined;
  return body?.comment?.id ?? '';
}
