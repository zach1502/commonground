import { createRoute, z } from '@hono/zod-openapi';

import { errorResponses, idParamsSchema, jsonBody, jsonContent } from '../contracts/common.js';
import {
  commentEditSchema,
  commentRecordResultSchema,
  commentResolveSchema,
  commentResultSchema,
  commentVisibilitySchema,
  designCommentsSchema,
  elementFeedbackSchema,
  newCommentSchema,
} from '../contracts/element-comments.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { HTTP_CREATED, HTTP_OK } from '../http-status.js';
import { requireSession, requireStaff } from '../middleware/http.js';
import { elementCommentCsvChunks, elementFeedback } from '../services/element-comment-insights.js';
import {
  createComment,
  editComment,
  listDesignComments,
  moderateComment,
} from '../services/element-comments.js';

import { streamOf } from './streams.js';

const TAGS = ['comments'];

const listRoute = createRoute({
  method: 'get',
  path: '/designs/{id}/comments',
  operationId: 'listDesignComments',
  tags: TAGS,
  summary: 'Comments on the elements of a submitted design, grouped by element',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(designCommentsSchema, 'The elements with comments, and the phase.'),
    ...errorResponses('invalid', 'not-found'),
  },
});

const createCommentRoute = createRoute({
  method: 'post',
  path: '/designs/{id}/comments',
  operationId: 'createComment',
  tags: TAGS,
  summary: 'Adds a comment on one element; the same kind on the same element replaces the text',
  request: { params: idParamsSchema, body: jsonBody(newCommentSchema) },
  responses: {
    [HTTP_CREATED]: jsonContent(commentResultSchema, 'The new comment.'),
    [HTTP_OK]: jsonContent(commentResultSchema, 'The comment whose text was replaced.'),
    ...errorResponses('invalid', 'unauthenticated', 'not-found', 'conflict', 'rate-limited'),
  },
});

const editRoute = createRoute({
  method: 'patch',
  path: '/comments/{id}',
  operationId: 'editComment',
  tags: TAGS,
  summary: "Edits the caller's own comment within 15 minutes, while the project is open",
  request: { params: idParamsSchema, body: jsonBody(commentEditSchema) },
  responses: {
    [HTTP_OK]: jsonContent(commentRecordResultSchema, 'The edited comment.'),
    ...errorResponses('invalid', 'unauthenticated', 'not-found', 'conflict', 'rate-limited'),
  },
});

const moderationErrors = errorResponses('invalid', 'unauthenticated', 'forbidden', 'not-found');

const resolveRoute = createRoute({
  method: 'post',
  path: '/comments/{id}/resolve',
  operationId: 'resolveComment',
  tags: TAGS,
  summary: 'Marks a comment resolved, with an optional reply, in either phase (staff only)',
  request: { params: idParamsSchema, body: jsonBody(commentResolveSchema) },
  responses: {
    [HTTP_OK]: jsonContent(commentRecordResultSchema, 'The resolved comment.'),
    ...moderationErrors,
  },
});

const hideRoute = createRoute({
  method: 'post',
  path: '/comments/{id}/hide',
  operationId: 'hideComment',
  tags: TAGS,
  summary: 'Hides or shows a comment, in either phase (staff only)',
  request: { params: idParamsSchema, body: jsonBody(commentVisibilitySchema) },
  responses: {
    [HTTP_OK]: jsonContent(commentRecordResultSchema, 'The comment.'),
    ...moderationErrors,
  },
});

const feedbackRoute = createRoute({
  method: 'get',
  path: '/projects/{id}/insights/element-feedback',
  operationId: 'getElementFeedback',
  tags: ['insights'],
  summary: 'Element comment counts per design by element kind and comment kind (staff only)',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(elementFeedbackSchema, 'The counts, most commented design first.'),
    ...errorResponses('unauthenticated', 'forbidden', 'not-found'),
  },
});

const csvRoute = createRoute({
  method: 'get',
  path: '/projects/{id}/insights/element-comments.csv',
  operationId: 'exportElementCommentsCsv',
  tags: ['insights'],
  summary: 'Every visible element comment as CSV, one row per comment, no names (staff only)',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: {
      description: 'The file, sent as an attachment.',
      content: { 'text/csv': { schema: z.string() } },
    },
    ...errorResponses('unauthenticated', 'forbidden', 'not-found'),
  },
});

function registerResidentRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(listRoute, async (c) => {
    const listed = await listDesignComments(deps, c.get('session'), c.req.valid('param').id);
    return c.json(listed, HTTP_OK);
  });

  app.openapi(createCommentRoute, async (c) => {
    const session = requireSession(c);
    const request = { designId: c.req.valid('param').id, body: c.req.valid('json') };
    const result = await createComment(deps, session, request);
    return result.outcome === 'created' ? c.json(result, HTTP_CREATED) : c.json(result, HTTP_OK);
  });

  app.openapi(editRoute, async (c) => {
    const session = requireSession(c);
    const request = { commentId: c.req.valid('param').id, text: c.req.valid('json').text };
    return c.json(await editComment(deps, session, request), HTTP_OK);
  });
}

function registerPlannerRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(resolveRoute, async (c) => {
    const session = requireStaff(c);
    const { reply } = c.req.valid('json');
    const moderation = { action: 'resolve', reply } as const;
    const request = { commentId: c.req.valid('param').id, moderation };
    return c.json(await moderateComment(deps, session, request), HTTP_OK);
  });

  app.openapi(hideRoute, async (c) => {
    const session = requireStaff(c);
    const moderation = { action: 'hide', hidden: c.req.valid('json').hidden } as const;
    const request = { commentId: c.req.valid('param').id, moderation };
    return c.json(await moderateComment(deps, session, request), HTTP_OK);
  });

  app.openapi(feedbackRoute, async (c) => {
    requireStaff(c);
    return c.json(await elementFeedback(deps, c.req.valid('param').id), HTTP_OK);
  });

  app.openapi(csvRoute, async (c) => {
    requireStaff(c);
    const projectId = c.req.valid('param').id;
    const chunks = await elementCommentCsvChunks(deps, projectId);
    return c.body(streamOf(chunks), HTTP_OK, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="parkshape-${projectId}-element-comments.csv"`,
    });
  });
}

/** Element comments: residents add and edit, planners resolve, reply and hide. */
export function registerElementCommentRoutes(app: ApiApp, deps: AppDeps): void {
  registerResidentRoutes(app, deps);
  registerPlannerRoutes(app, deps);
}
