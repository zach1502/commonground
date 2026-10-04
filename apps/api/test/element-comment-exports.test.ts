import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { elementFeedbackSchema } from '../src/contracts/element-comments.js';

import {
  HIDE,
  BENCH_ID,
  GARDEN_ID,
  REVIEWABLE,
  STORES,
  WALK_ID,
  WORLD_START_TIMEOUT_MS,
  commentIdOf,
  startCommentWorld,
  submitAs,
  type CommentWorld,
  type Store,
} from './element-comment-world.js';
import { KEVIN, MOLLY, SALLY, STAFF, errorKind } from './harness.js';
import { rawCall } from './security/world.js';

const COMMENT_LIMIT = 10;
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

const CSV_HEADER =
  'design_title,element_kind,category,element_label,element_id,comment_kind,text,status,reply,created_at';

/** Two designs with comments on all three element kinds, one of them hidden. */
async function commentedProject(world: CommentWorld) {
  const { projectId, designId } = await world.freshTarget();
  const second = await submitAs(world.h, world.cookie(SALLY), projectId, REVIEWABLE);
  await world.post(MOLLY, designId, { elementId: GARDEN_ID, kind: 'keep', text: 'Keep the beds' });
  await world.post(MOLLY, designId, { elementId: WALK_ID, kind: 'change', text: 'Wider, please' });
  await world.post(KEVIN, designId, { elementId: BENCH_ID, kind: 'move', text: '=SUM(A1)' });
  const hidden = await world.post(KEVIN, designId, { elementId: BENCH_ID, kind: 'remove' });
  await world.hide(STAFF, commentIdOf(hidden), HIDE);
  await world.post(MOLLY, second, { elementId: BENCH_ID, kind: 'question', text: 'Shade?' });
  return { projectId, designId, second };
}

/** A CSV line split into fields, with quoted fields kept whole and their quotes removed. */
function csvFields(line: string): string[] {
  const fields = line.match(/"(?:[^"]|"")*"|[^,]+|(?<=,)(?=,|$)|^(?=,)/g) ?? [];
  return fields.map((field) =>
    field.startsWith('"') ? field.slice(1, -1).replaceAll('""', '"') : field,
  );
}

async function csvRows(world: CommentWorld, projectId: string, persona = STAFF) {
  const path = `/projects/${projectId}/insights/element-comments.csv`;
  const cookie = world.cookie(persona);
  return rawCall(world.h, { method: 'GET', path }, { cookie });
}

for (const store of STORES) {
  describe(`the element comment CSV on ${store}`, () => {
    it('lists visible comments by design, element kind, category and label', async () => {
      const world = worldOn(store);
      const { projectId } = await commentedProject(world);
      const response = await csvRows(world, projectId);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      const [header, ...rows] = response.text.trimEnd().split('\r\n');
      expect(header).toBe(CSV_HEADER);
      const columns = rows.map((row) => csvFields(row));
      expect(columns.map(([, kind, category, , id]) => [kind, category, id])).toEqual([
        ['item', 'seating', BENCH_ID],
        ['path', 'path', WALK_ID],
        ['area', 'garden', GARDEN_ID],
        ['item', 'seating', BENCH_ID],
      ]);
      expect(rows[0]).toContain(`"'=SUM(A1)"`);
      expect(columns[0]?.[3]).toMatch(/^Bench, /);
      expect(response.text).not.toContain('remove');
    });

    it('is for planners only', async () => {
      const world = worldOn(store);
      const { projectId } = await world.freshTarget();
      expect((await csvRows(world, projectId, MOLLY)).status).toBe(403);
      const path = `/projects/${projectId}/insights/element-comments.csv`;
      expect((await rawCall(world.h, { method: 'GET', path })).status).toBe(401);
      expect((await csvRows(world, 'no-such-project')).status).toBe(404);
    });
  });

  describe(`element feedback counts on ${store}`, () => {
    it('counts visible comments per design by element kind and comment kind', async () => {
      const world = worldOn(store);
      const { projectId, designId, second } = await commentedProject(world);
      const path = `/projects/${projectId}/insights/element-feedback`;
      const response = await world.h.call('GET', path, { cookie: world.cookie(STAFF) });
      const feedback = elementFeedbackSchema.parse(response.body);
      expect(feedback.total).toBe(4);
      expect(feedback.designs.map((design) => [design.designId, design.total])).toEqual([
        [designId, 3],
        [second, 1],
      ]);
      expect(feedback.designs[0]?.byElementKind).toEqual({ item: 1, path: 1, area: 1 });
      expect(feedback.designs[0]?.byKind).toMatchObject({ keep: 1, change: 1, move: 1, remove: 0 });
      const forResident = await world.h.call('GET', path, { cookie: world.cookie(MOLLY) });
      expect(forResident.status).toBe(403);
    });
  });
}

describe('the comments rate limit', () => {
  let world: CommentWorld;

  beforeAll(async () => {
    world = await startCommentWorld('database', {
      RATE_LIMIT_COMMENTS_PER_MINUTE: String(COMMENT_LIMIT),
    });
  }, WORLD_START_TIMEOUT_MS);

  afterAll(async () => {
    await world.h.close();
  });

  it('answers 429 on the 11th comment in a minute, and a refused one costs nothing', async () => {
    const { designId } = await world.freshTarget();
    const refused = await world.post(MOLLY, designId, { elementId: 'swing-9', kind: 'keep' });
    expect(refused.status).toBe(400);
    const texts = Array.from({ length: COMMENT_LIMIT }, (_, index) => `Note ${String(index)}`);
    for (const text of texts) {
      const sent = await world.post(MOLLY, designId, { elementId: BENCH_ID, kind: 'move', text });
      expect(sent.status).toBeLessThan(300);
    }
    const limited = await world.post(MOLLY, designId, { elementId: GARDEN_ID, kind: 'keep' });
    expect([limited.status, errorKind(limited.body)]).toEqual([429, 'rate-limited']);
    expect(limited.headers.get('Retry-After')).not.toBeNull();
    expect((await world.post(KEVIN, designId, { elementId: GARDEN_ID, kind: 'keep' })).status).toBe(
      201,
    );
  });
});
