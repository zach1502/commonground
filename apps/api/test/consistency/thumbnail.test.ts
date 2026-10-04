import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { GARDEN, createDraft, createProject } from '../fixtures.js';
import { errorKind } from '../harness.js';

import { projectWithLiveDesign, startRaceWorld, version, type RaceWorld } from './race-world.js';

let world: RaceWorld;

beforeAll(async () => {
  world = await startRaceWorld();
});

afterAll(async () => {
  await world.h.close();
});

// The eight-byte PNG signature the route checks, then bytes that tell two pictures apart.
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const picture = (tag: number) => Buffer.from([...PNG_SIGNATURE, tag, tag, tag]).toString('base64');
const FIRST = picture(1);
const SECOND = picture(2);

function upload(cookie: string, designId: string, image: string) {
  return world.h.call('POST', `/designs/${designId}/thumbnail`, { cookie, body: { image } });
}

async function storedPicture(designId: string) {
  const design = await world.h.deps.repos.designs.findById(designId);
  const ref = design?.thumbnailRef ?? null;
  if (ref === null) return { ref, bytes: undefined };
  const blob = await world.blobs.get(ref);
  return {
    ref,
    bytes: blob === undefined ? undefined : Buffer.from(blob.bytes).toString('base64'),
  };
}

describe('setThumbnail with a competing write between the blob put and the row update', () => {
  it('does not attach a picture of a draft that a save changed in the meantime', async () => {
    const project = await createProject(world.h, world.staff);
    const draft = await createDraft(world.h, world.bob, project.id);
    world.blobs.afterPut(async () => {
      const body = { title: 'Garden corner', blurb: 'Beds.', document: GARDEN };
      const put = { cookie: world.bob, body };
      expect((await world.h.call('PUT', `/designs/${draft.id}`, put)).status).toBe(200);
    });
    const response = await upload(world.bob, draft.id, FIRST);
    expect(response.status).toBe(409);
    expect(errorKind(response.body)).toBe('wrong-status');
    expect((await storedPicture(draft.id)).ref).toBeNull();
  });

  it('keeps the stored key and its bytes from the same upload when two uploads interleave', async () => {
    const { live } = await projectWithLiveDesign(world);
    world.blobs.afterPut(async () => {
      expect((await upload(world.bob, live.id, SECOND)).status).toBe(200);
    });
    const response = await upload(world.bob, live.id, FIRST);
    expect(response.status).toBe(200);
    // The first upload's row update landed last, so its picture is the one on the design.
    expect((await storedPicture(live.id)).bytes).toBe(FIRST);
  });

  it('keeps a draft picture under its content key as private as the draft', async () => {
    const project = await createProject(world.h, world.staff);
    const draft = await createDraft(world.h, world.bob, project.id);
    expect((await upload(world.bob, draft.id, FIRST)).status).toBe(200);
    const { ref } = await storedPicture(draft.id);
    expect(ref).toMatch(new RegExp(`^thumbnails/${draft.id}/[0-9a-f]{16}\\.png$`));
    const path = `/blobs/${ref ?? ''}`;
    const read = (cookie?: string) =>
      world.h.app.request(path, cookie === undefined ? {} : { headers: { Cookie: cookie } });
    expect((await read(world.bob)).status).toBe(200);
    expect((await read(world.molly)).status).toBe(404);
    expect((await read()).status).toBe(404);
  });

  it('attaches to the design it was taken of, never to a version made in the meantime', async () => {
    const { project, live } = await projectWithLiveDesign(world);
    let successorId = '';
    world.blobs.afterPut(async () => {
      const made = await version(world, world.bob, live.id);
      successorId = (made.body as { id: string }).id;
    });
    const response = await upload(world.bob, live.id, FIRST);
    expect(response.status).toBe(200);
    expect((await storedPicture(live.id)).bytes).toBe(FIRST);
    expect((await storedPicture(successorId)).ref).toBeNull();
    const successor = await world.h.deps.repos.designs.findVersionOf(live.id);
    expect(successor?.projectId).toBe(project.id);
  });
});
