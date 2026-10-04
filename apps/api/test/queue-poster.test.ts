import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { queueSchema } from '../src/contracts/participation.js';
import { designSchema } from '../src/contracts/projects-designs.js';

import { createProject, submitGarden, thumbnailPath } from './fixtures.js';
import { BOB, MOLLY, STAFF, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let bob: string;
let molly: string;

// A 1x1 lossless WebP: RIFF, the size, then WEBP and one VP8L chunk.
const WEBP_1X1 = 'UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==';
const HEX_COLOUR = /^#[0-9a-f]{6}$/;

beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' });
  staff = await h.login(STAFF);
  bob = await h.login(BOB);
  molly = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

async function liveDesignWithThumbnail() {
  const project = await createProject(h, staff);
  const design = await submitGarden(h, bob, project.id);
  const saved = await h.call('POST', `/designs/${design.id}/thumbnail`, {
    cookie: bob,
    body: { image: WEBP_1X1 },
  });
  return { project, design, saved };
}

describe('webp thumbnails', () => {
  it('stores a WebP and serves it back as image/webp', async () => {
    const { design, saved } = await liveDesignWithThumbnail();
    expect(saved.status).toBe(200);
    const parsed = designSchema.parse(saved.body);
    expect(parsed.thumbnailUrl).toContain(thumbnailPath(design.id, WEBP_1X1));
    const blob = await h.app.request(thumbnailPath(design.id, WEBP_1X1));
    expect(blob.status).toBe(200);
    expect(blob.headers.get('Content-Type')).toBe('image/webp');
    expect((await blob.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });
});

describe('queue poster', () => {
  it('carries the project and the first poster with its size and a placeholder colour', async () => {
    const { project, design } = await liveDesignWithThumbnail();
    const response = await h.call('GET', `/projects/${project.id}/queue?n=5`, { cookie: molly });
    const batch = queueSchema.parse(response.body);
    expect(batch.project.id).toBe(project.id);
    expect(batch.project.name).toBe(project.name);
    expect(batch.poster?.designId).toBe(design.id);
    expect(batch.poster?.url).toContain(thumbnailPath(design.id, WEBP_1X1));
    expect(batch.poster?.url).toBe(batch.designs[0]?.thumbnailUrl);
    expect(batch.poster?.width).toBe(640);
    expect(batch.poster?.height).toBe(400);
    expect(batch.poster?.placeholder).toMatch(HEX_COLOUR);
  });

  it('has no poster when the first design has no thumbnail', async () => {
    const project = await createProject(h, staff);
    await submitGarden(h, bob, project.id);
    const response = await h.call('GET', `/projects/${project.id}/queue?n=5`, { cookie: molly });
    expect(queueSchema.parse(response.body).poster).toBeNull();
  });
});
