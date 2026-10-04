import type { ApiClient, components } from '@parkshape/api-client';

type Schemas = components['schemas'];

/** One comment as the caller sees it; hidden ones reach planners only. */
export type ReviewComment = Schemas['ElementCommentRecord'];
/** The comments on one element, with its label and counts per comment kind. */
export type ElementComments = Schemas['ElementCommentGroup'];
/** GET /designs/{id}/comments */
export type DesignComments = Schemas['DesignComments'];
/** POST /designs/{id}/comments; surfacePoint only for a path or an area. */
export type AddCommentInput = Schemas['NewComment'];
/** 201 created, or 200 when the same author, element and kind already had an open comment. */
export type AddedComment = Schemas['CommentResult'];
/** PATCH /comments/{id} */
export type CommentChange = Schemas['CommentEdit'];
export type CommentVisibility = Schemas['CommentVisibility'];
export type ElementFeedback = Schemas['ElementFeedback'];
export type DesignFeedback = ElementFeedback['designs'][number];

/** What residents use: read, add and edit their own. */
export interface ReviewApi {
  readonly listComments: (designId: string) => Promise<DesignComments>;
  readonly addComment: (designId: string, input: AddCommentInput) => Promise<AddedComment>;
  readonly editComment: (commentId: string, change: CommentChange) => Promise<ReviewComment>;
}

/** What planners add on the insights page: resolve with a reply, hide and the counts. */
export interface PlannerReviewApi {
  readonly resolveComment: (commentId: string, reply?: string) => Promise<ReviewComment>;
  readonly hideComment: (commentId: string, change: CommentVisibility) => Promise<ReviewComment>;
  readonly elementFeedback: (projectId: string) => Promise<ElementFeedback>;
}

export type FullReviewApi = ReviewApi & PlannerReviewApi;

/** The element comment endpoints, through the generated client. */
export function createReviewApi(client: ApiClient): FullReviewApi {
  return {
    listComments: (designId) =>
      client.request('get', '/designs/{id}/comments', { path: { id: designId } }),
    addComment: (designId, input) =>
      client.request('post', '/designs/{id}/comments', { path: { id: designId }, body: input }),
    editComment: async (commentId, change) =>
      (await client.request('patch', '/comments/{id}', { path: { id: commentId }, body: change }))
        .comment,
    resolveComment: async (commentId, reply) => {
      const body = reply === undefined || reply === '' ? {} : { reply };
      const path = { id: commentId };
      return (await client.request('post', '/comments/{id}/resolve', { path, body })).comment;
    },
    hideComment: async (commentId, change) => {
      const path = { id: commentId };
      return (await client.request('post', '/comments/{id}/hide', { path, body: change })).comment;
    },
    elementFeedback: (projectId) =>
      client.request('get', '/projects/{id}/insights/element-feedback', {
        path: { id: projectId },
      }),
  };
}
