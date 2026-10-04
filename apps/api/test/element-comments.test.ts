import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ELEMENT_COMMENT_MAX_CHARS } from '@parkshape/core';

import { commentResultSchema, designCommentsSchema } from '../src/contracts/element-comments.js';

import {
  HIDE,
  BENCH_ID,
  GARDEN_ID,
  STORES,
  WALK_ID,
  WORLD_START_TIMEOUT_MS,
  startCommentWorld,
  type CommentWorld,
  type Store,
} from './element-comment-world.js';
import { KEVIN, MOLLY, STAFF, errorKind } from './harness.js';

const worlds = new Map<Store, CommentWorld>();

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

for (const store of STORES) {
  describe(`POST /designs/{id}/comments on ${store}`, () => {
    it('adds a comment, taking the element kind and category from the document', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const body = { ...move, elementKind: 'area', category: 'garden' };
      const created = await world.post(MOLLY, designId, body);
      expect(created.status).toBe(201);
      expect(commentResultSchema.parse(created.body)).toMatchObject({
        outcome: 'created',
        comment: {
          designId,
          elementId: BENCH_ID,
          elementKind: 'item',
          category: 'seating',
          kind: 'move',
          text: 'Face the playground',
          status: 'open',
          surfacePoint: null,
          plannerReply: null,
          author: { displayName: expect.any(String) as string },
          mine: true,
          editable: true,
        },
      });
    });

    it('replaces the text of the same kind on the same element and answers 200', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const first = commentResultSchema.parse((await world.post(MOLLY, designId, move)).body);
      const again = await world.post(MOLLY, designId, { ...move, text: 'Face south' });
      expect(again.status).toBe(200);
      const result = commentResultSchema.parse(again.body);
      expect(result).toMatchObject({ outcome: 'updated', comment: { text: 'Face south' } });
      expect(result.comment.id).toBe(first.comment.id);
    });

    it('takes a comment with no text, since the kind alone counts', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const created = await world.post(MOLLY, designId, { elementId: GARDEN_ID, kind: 'keep' });
      expect(created.status).toBe(201);
      expect(commentResultSchema.parse(created.body).comment.text).toBe('');
    });
  });

  describe(`POST /designs/{id}/comments anchors on ${store}`, () => {
    it('keeps a tap point on a path and drops one on an item', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const surfacePoint = { x: 60, y: 60.5 };
      const onWalk = await world.post(MOLLY, designId, {
        elementId: WALK_ID,
        kind: 'change',
        surfacePoint,
      });
      expect(commentResultSchema.parse(onWalk.body).comment.surfacePoint).toEqual(surfacePoint);
      const onBench = await world.post(MOLLY, designId, { ...move, surfacePoint });
      expect(commentResultSchema.parse(onBench.body).comment.surfacePoint).toBeNull();
    });

    it('refuses an element the design does not have and a tap point off the walk', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const unknown = await world.post(MOLLY, designId, { ...move, elementId: 'swing-9' });
      expect([unknown.status, errorKind(unknown.body)]).toEqual([400, 'validation']);
      const offWalk = { elementId: WALK_ID, kind: 'change', surfacePoint: { x: 60, y: 70 } };
      const off = await world.post(MOLLY, designId, offWalk);
      expect([off.status, errorKind(off.body)]).toEqual([400, 'validation']);
    });
  });

  describe(`comment text bounds on ${store}`, () => {
    it(`takes ${String(ELEMENT_COMMENT_MAX_CHARS)} characters and refuses one more`, async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const longest = 'a'.repeat(ELEMENT_COMMENT_MAX_CHARS);
      expect((await world.post(MOLLY, designId, { ...move, text: longest })).status).toBe(201);
      const over = await world.post(KEVIN, designId, { ...move, text: `${longest}a` });
      expect([over.status, errorKind(over.body)]).toEqual([400, 'validation']);
    });

    it('refuses HTML tags but keeps a lone angle bracket', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const tagged = await world.post(MOLLY, designId, { ...move, text: '<b>Move it</b>' });
      expect([tagged.status, errorKind(tagged.body)]).toEqual([400, 'validation']);
      const plain = await world.post(MOLLY, designId, { ...move, text: 'Keep it under 3 m < 5 m' });
      expect(plain.status).toBe(201);
    });

    it('refuses text the database cannot store and a kind outside the list', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const nul = await world.post(MOLLY, designId, {
        ...move,
        text: `a${String.fromCharCode(0)}b`,
      });
      expect(nul.status).toBe(400);
      expect((await world.post(MOLLY, designId, { ...move, kind: 'shout' })).status).toBe(400);
    });
  });

  describe(`GET /designs/{id}/comments on ${store}`, () => {
    it('groups comments by element with counts, for guests too', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      await world.post(MOLLY, designId, { elementId: WALK_ID, kind: 'change' });
      await world.post(MOLLY, designId, move);
      await world.post(KEVIN, designId, move);
      await world.post(KEVIN, designId, { ...move, kind: 'question', text: 'Is it shaded?' });
      const listed = designCommentsSchema.parse((await world.list(designId)).body);
      expect(listed.commenting).toBe('open');
      expect(listed.elements.map((group) => [group.elementId, group.elementKind])).toEqual([
        [BENCH_ID, 'item'],
        [WALK_ID, 'path'],
      ]);
      const [bench] = listed.elements;
      expect(bench?.label).toMatch(/^Bench, /);
      expect(bench?.counts).toEqual({ keep: 0, move: 2, change: 0, remove: 0, question: 1 });
      expect(bench?.openCount).toBe(3);
      expect(bench?.comments.every((comment) => !comment.mine && !comment.editable)).toBe(true);
    });

    it('marks the caller own comments and hides hidden ones from everyone but planners', async () => {
      const world = worldOn(store);
      const { designId } = await world.freshTarget();
      const mine = await world.post(MOLLY, designId, move);
      const theirs = (await world.post(KEVIN, designId, move)).body as { comment: { id: string } };
      await world.hide(STAFF, theirs.comment.id, HIDE);
      const forMolly = designCommentsSchema.parse((await world.list(designId, MOLLY)).body);
      const shown = forMolly.elements.flatMap((group) => group.comments);
      expect(shown.map((comment) => [comment.id, comment.mine])).toEqual([
        [commentResultSchema.parse(mine.body).comment.id, true],
      ]);
      const forStaff = designCommentsSchema.parse((await world.list(designId, STAFF)).body);
      const all = forStaff.elements.flatMap((group) => group.comments);
      expect(all.map((comment) => comment.hidden)).toEqual([false, true]);
      expect(forStaff.elements[0]?.counts.move).toBe(1);
    });
  });
}
