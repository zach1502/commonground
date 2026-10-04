import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { COMMENT_EDIT_WINDOW_MS } from '@parkshape/core';

import {
  commentRecordResultSchema,
  designCommentsSchema,
} from '../src/contracts/element-comments.js';

import {
  HIDE,
  BENCH_ID,
  STORES,
  WORLD_START_TIMEOUT_MS,
  commentIdOf,
  startCommentWorld,
  type CommentWorld,
  type Store,
} from './element-comment-world.js';
import { BOB, KEVIN, MOLLY, STAFF, errorKind, type CallResult } from './harness.js';

const worlds = new Map<Store, CommentWorld>();
const SECOND_MS = 1000;

beforeAll(async () => {
  for (const store of STORES) worlds.set(store, await startCommentWorld(store));
}, WORLD_START_TIMEOUT_MS * STORES.length);

afterAll(async () => {
  for (const world of worlds.values()) await world.h.close();
});

function worldOn(store: Store): CommentWorld {
  const world = worlds.get(store);
  if (world === undefined) throw new Error(`no ${store} world`);
  return world;
}

const move = { elementId: BENCH_ID, kind: 'move', text: 'Face the playground' } as const;

/** The status, kind and message a caller sees, without the per-request id. */
function answerOf(response: CallResult) {
  const error = (response.body as { error?: { kind?: string; message?: string } } | undefined)
    ?.error;
  return { status: response.status, kind: error?.kind, message: error?.message };
}

async function mollysComment(world: CommentWorld) {
  const target = await world.freshTarget();
  const commentId = commentIdOf(await world.post(MOLLY, target.designId, move));
  return { ...target, commentId };
}

for (const store of STORES) {
  describe(`designs a person may not see, on ${store}`, () => {
    it('answers the same 404 for a draft, the baseline and an unknown design', async () => {
      const world = worldOn(store);
      const { draftId, baselineId } = await world.freshTarget();
      const missing = answerOf(await world.list('no-such-design'));
      expect(missing).toMatchObject({ status: 404, kind: 'not-found' });
      for (const id of [draftId, baselineId]) {
        expect(answerOf(await world.list(id, BOB))).toEqual(missing);
        expect(answerOf(await world.post(BOB, id, move))).toEqual(
          answerOf(await world.post(BOB, 'no-such-design', move)),
        );
      }
    });

    it('lists a superseded version but takes no new comment on it', async () => {
      const world = worldOn(store);
      const { designId, commentId } = await mollysComment(world);
      await world.h.call('POST', `/designs/${designId}/version`, { cookie: world.cookie(BOB) });
      const listed = designCommentsSchema.parse((await world.list(designId)).body);
      expect(listed.elements[0]?.comments.map((comment) => comment.id)).toEqual([commentId]);
      const refused = await world.post(KEVIN, designId, move);
      expect([refused.status, errorKind(refused.body)]).toEqual([409, 'wrong-status']);
    });
  });

  describe(`who may write, on ${store}`, () => {
    it('needs a session to comment, and lets the design author comment', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      expect((await world.post(undefined, designId, move)).status).toBe(401);
      expect((await world.post(BOB, designId, move)).status).toBe(201);
      expect((await world.post(STAFF, designId, move)).status).toBe(201);
    });

    it('lets only the author edit, answering 404 to everyone else as for a missing one', async () => {
      const world = worldOn(store);
      const { commentId } = await mollysComment(world);
      const edited = await world.patch(MOLLY, commentId, 'Turn it to the south');
      expect(commentRecordResultSchema.parse(edited.body).comment.text).toBe(
        'Turn it to the south',
      );
      const missing = answerOf(await world.patch(KEVIN, 'no-such-comment', 'x'));
      expect(missing).toMatchObject({ status: 404, kind: 'not-found' });
      expect(answerOf(await world.patch(KEVIN, commentId, 'x'))).toEqual(missing);
      expect(answerOf(await world.patch(STAFF, commentId, 'x'))).toEqual(missing);
      expect((await world.patch(undefined, commentId, 'x')).status).toBe(401);
    });

    it('lets only planners resolve and hide', async () => {
      const world = worldOn(store);
      const { commentId } = await mollysComment(world);
      for (const persona of [MOLLY, KEVIN]) {
        expect((await world.resolve(persona, commentId)).status).toBe(403);
        expect((await world.hide(persona, commentId, HIDE)).status).toBe(403);
      }
      expect((await world.resolve(undefined, commentId)).status).toBe(401);
      expect((await world.hide(undefined, commentId, HIDE)).status).toBe(401);
      const resolved = await world.resolve(STAFF, commentId, 'We turned it.');
      expect(commentRecordResultSchema.parse(resolved.body).comment).toMatchObject({
        status: 'resolved',
        plannerReply: { text: 'We turned it.' },
      });
      expect((await world.resolve(STAFF, 'no-such-comment')).status).toBe(404);
    });
  });

  describe(`the edit window and the phase, on ${store}`, () => {
    it('allows an edit for 15 minutes after the comment, then answers 409', async () => {
      const world = worldOn(store);
      const { commentId } = await mollysComment(world);
      world.h.clock.advance(COMMENT_EDIT_WINDOW_MS);
      expect((await world.patch(MOLLY, commentId, 'Still in time')).status).toBe(200);
      world.h.clock.advance(SECOND_MS);
      const late = await world.patch(MOLLY, commentId, 'Too late');
      expect([late.status, errorKind(late.body)]).toEqual([409, 'wrong-status']);
    });

    it('closes resident writes when the project closes and keeps planner moderation', async () => {
      const world = worldOn(store);
      const { projectId, designId, commentId } = await mollysComment(world);
      await world.close(projectId);
      const refused = await world.post(KEVIN, designId, move);
      expect([refused.status, errorKind(refused.body)]).toEqual([409, 'phase-closed']);
      expect(errorKind((await world.patch(MOLLY, commentId, 'Late edit')).body)).toBe(
        'phase-closed',
      );
      expect((await world.resolve(STAFF, commentId, 'Noted for the plan.')).status).toBe(200);
      expect((await world.hide(STAFF, commentId, HIDE)).status).toBe(200);
      const listed = designCommentsSchema.parse((await world.list(designId, STAFF)).body);
      expect(listed.commenting).toBe('closed');
      expect(listed.elements[0]?.comments[0]).toMatchObject({ hidden: true, editable: false });
    });
  });
}
