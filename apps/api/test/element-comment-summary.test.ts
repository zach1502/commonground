import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { summaryResponseSchema } from '../src/contracts/ai.js';

import {
  BENCH_ID,
  HIDE,
  WALK_ID,
  commentIdOf,
  startCommentWorld,
  WORLD_START_TIMEOUT_MS,
  type CommentWorld,
} from './element-comment-world.js';
import { KEVIN, MOLLY, SALLY, STAFF } from './harness.js';

let world: CommentWorld;

beforeAll(async () => {
  world = await startCommentWorld('memory');
}, WORLD_START_TIMEOUT_MS);

afterAll(async () => {
  await world.h.close();
});

async function summaryOf(projectId: string) {
  const response = await world.h.call('GET', `/projects/${projectId}/summary`, {
    cookie: world.cookie(STAFF),
  });
  expect(response.status).toBe(200);
  return summaryResponseSchema.parse(response.body);
}

describe('GET /projects/:id/summary with element comments', () => {
  it('states the visible comment count and the most commented element name', async () => {
    const target = await world.freshTarget();
    await world.post(MOLLY, target.designId, { elementId: BENCH_ID, kind: 'move' });
    await world.post(KEVIN, target.designId, { elementId: BENCH_ID, kind: 'keep' });
    const hidden = await world.post(SALLY, target.designId, { elementId: WALK_ID, kind: 'change' });
    await world.post(MOLLY, target.designId, { elementId: WALK_ID, kind: 'question' });
    await world.hide(STAFF, commentIdOf(hidden), HIDE);
    expect((await summaryOf(target.projectId)).commentLine).toBe(
      '3 comments on elements, most on Bench',
    );
  });

  it('has no comment line before anyone comments', async () => {
    const target = await world.freshTarget();
    expect((await summaryOf(target.projectId)).commentLine).toBeUndefined();
  });
});
