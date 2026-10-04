import { createRoute } from '@hono/zod-openapi';

import { errorResponses, idParamsSchema, jsonBody, jsonContent } from '../contracts/common.js';
import {
  leaderboardSchema,
  myVoteSchema,
  queueQuerySchema,
  queueSchema,
  voteBodySchema,
  voteChangeSchema,
  voteResultSchema,
  withdrawResultSchema,
} from '../contracts/participation.js';
import type { ApiApp, AppDeps } from '../deps.js';
import { HTTP_OK } from '../http-status.js';
import { requireSession } from '../middleware/http.js';
import { leaderboard } from '../services/leaderboard.js';
import { castVote, myVote, reviewQueue } from '../services/participation.js';
import { setMyVote, withdrawMyVote } from '../services/vote-changes.js';

const vote = createRoute({
  method: 'post',
  path: '/votes',
  operationId: 'castVote',
  tags: ['votes'],
  summary: 'Vote up or down on a live design, with reasons; voting again changes the vote',
  request: { body: jsonBody(voteBodySchema) },
  responses: {
    [HTTP_OK]: jsonContent(voteResultSchema, 'The stored vote and the new counts.'),
    ...errorResponses(
      'invalid',
      'unauthenticated',
      'forbidden',
      'not-found',
      'conflict',
      'rate-limited',
    ),
  },
});

const queue = createRoute({
  method: 'get',
  path: '/projects/{id}/queue',
  operationId: 'getQueue',
  tags: ['votes'],
  summary: 'Designs for the caller to review; skips their own and ones they voted on',
  request: { params: idParamsSchema, query: queueQuerySchema },
  responses: {
    [HTTP_OK]: jsonContent(queueSchema, 'The review batch, authors hidden.'),
    ...errorResponses('invalid', 'unauthenticated', 'not-found'),
  },
});

const myVoteRoute = createRoute({
  method: 'get',
  path: '/designs/{id}/my-vote',
  operationId: 'getMyVote',
  tags: ['votes'],
  summary: "The caller's own vote on a design, so they can change it",
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(myVoteSchema, 'The vote or null.'),
    ...errorResponses('unauthenticated', 'not-found'),
  },
});

const voteWriteErrors = errorResponses(
  'invalid',
  'unauthenticated',
  'forbidden',
  'not-found',
  'conflict',
  'rate-limited',
);

const setMyVoteRoute = createRoute({
  method: 'put',
  path: '/designs/{id}/my-vote',
  operationId: 'setMyVote',
  tags: ['votes'],
  summary: "Sets the caller's vote on a live design: up or down, the reasons and a comment",
  request: { params: idParamsSchema, body: jsonBody(voteChangeSchema) },
  responses: {
    [HTTP_OK]: jsonContent(voteResultSchema, 'The stored vote and the new counts.'),
    ...voteWriteErrors,
  },
});

const withdrawRoute = createRoute({
  method: 'delete',
  path: '/designs/{id}/my-vote',
  operationId: 'withdrawMyVote',
  tags: ['votes'],
  summary: "Withdraws the caller's vote on a live design and takes it off the counts",
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(withdrawResultSchema, 'Whether a vote was removed, and the counts.'),
    ...errorResponses('unauthenticated', 'forbidden', 'not-found', 'conflict', 'rate-limited'),
  },
});

const board = createRoute({
  method: 'get',
  path: '/projects/{id}/leaderboard',
  operationId: 'getLeaderboard',
  tags: ['votes'],
  summary: 'Live designs ranked by score; authors shown only where the caller voted',
  request: { params: idParamsSchema },
  responses: {
    [HTTP_OK]: jsonContent(leaderboardSchema, 'Ranked designs.'),
    ...errorResponses('not-found'),
  },
});

export function registerParticipationRoutes(app: ApiApp, deps: AppDeps): void {
  app.openapi(vote, async (c) => {
    const result = await castVote(deps, requireSession(c), c.req.valid('json'));
    return c.json(result, HTTP_OK);
  });

  app.openapi(queue, async (c) => {
    const session = requireSession(c);
    const batch = await reviewQueue(deps, session, c.req.valid('param').id, c.req.valid('query').n);
    return c.json(batch, HTTP_OK);
  });

  app.openapi(myVoteRoute, async (c) => {
    const session = requireSession(c);
    const vote = await myVote(deps, session, c.req.valid('param').id);
    return c.json(vote, HTTP_OK);
  });

  app.openapi(setMyVoteRoute, async (c) => {
    const session = requireSession(c);
    const result = await setMyVote(deps, session, c.req.valid('param').id, c.req.valid('json'));
    return c.json(result, HTTP_OK);
  });

  app.openapi(withdrawRoute, async (c) => {
    const result = await withdrawMyVote(deps, requireSession(c), c.req.valid('param').id);
    return c.json(result, HTTP_OK);
  });

  app.openapi(board, async (c) => {
    const ranked = await leaderboard(deps, c.get('session'), c.req.valid('param').id);
    return c.json(ranked, HTTP_OK);
  });
}
