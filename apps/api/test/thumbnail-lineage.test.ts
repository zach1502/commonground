import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  designSchema,
  designListSchema,
  submitResultSchema,
} from '../src/contracts/projects-designs.js';

import { createDraft, createProject, submitGarden, thumbnailPath } from './fixtures.js';
import { BOB, MOLLY, STAFF, errorKind, startHarness, type Harness } from './harness.js';

let h: Harness;
let staff: string;
let bob: string;
let molly: string;

// A 1x1 PNG: the eight-byte signature the thumbnail route checks, then the rest of a valid file.
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

beforeAll(async () => {
  h = await startHarness({ RATE_LIMIT_SUBMISSIONS_PER_HOUR: '100' });
  staff = await h.login(STAFF);
  bob = await h.login(BOB);
  molly = await h.login(MOLLY);
});

afterAll(async () => {
  await h.close();
});

describe('submit result', () => {
  it('returns the metrics and soft warnings when a design passes the hard rules', async () => {
    const project = await createProject(h, staff);
    const draft = await createDraft(h, bob, project.id);
    await h.call('PUT', `/designs/${draft.id}`, {
      cookie: bob,
      body: { title: 'Beds', blurb: 'By the lane.', document: gardenDoc() },
    });
    const response = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: bob });
    const result = submitResultSchema.parse(response.body);
    expect(result.status).toBe('submitted');
    expect(result.hardFailures).toEqual([]);
    expect(Array.isArray(result.softWarnings)).toBe(true);
    for (const warning of result.softWarnings) {
      expect(warning.badge.length).toBeGreaterThan(0);
    }
  });
});

describe('thumbnails', () => {
  it('stores the PNG and serves it back through the blob route', async () => {
    const project = await createProject(h, staff);
    const design = await submitGarden(h, bob, project.id);
    const saved = await h.call('POST', `/designs/${design.id}/thumbnail`, {
      cookie: bob,
      body: { image: PNG_1X1 },
    });
    const parsed = designSchema.parse(saved.body);
    expect(parsed.thumbnailUrl).toContain(thumbnailPath(design.id, PNG_1X1));

    const blob = await h.app.request(thumbnailPath(design.id, PNG_1X1));
    expect(blob.status).toBe(200);
    expect(blob.headers.get('Content-Type')).toBe('image/png');
    expect((await blob.arrayBuffer()).byteLength).toBeGreaterThan(0);

    const gallery = designListSchema.parse(
      (await h.call('GET', `/projects/${project.id}/designs`)).body,
    );
    expect(gallery.designs[0]?.thumbnailUrl).toContain(thumbnailPath(design.id, PNG_1X1));
  });

  it('rejects a non-PNG, an oversize file, another author and no session', async () => {
    const project = await createProject(h, staff);
    const design = await submitGarden(h, bob, project.id);
    const notPng = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]).toString('base64');
    const bad = await h.call('POST', `/designs/${design.id}/thumbnail`, {
      cookie: bob,
      body: { image: notPng },
    });
    expect(bad.status).toBe(400);

    const big = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.alloc(500 * 1024 + 1),
    ]).toString('base64');
    const oversize = await h.call('POST', `/designs/${design.id}/thumbnail`, {
      cookie: bob,
      body: { image: big },
    });
    expect(oversize.status).toBe(400);

    const other = await h.call('POST', `/designs/${design.id}/thumbnail`, {
      cookie: molly,
      body: { image: PNG_1X1 },
    });
    expect(other.status).toBe(403);
    expect(
      (await h.call('POST', `/designs/${design.id}/thumbnail`, { body: { image: PNG_1X1 } }))
        .status,
    ).toBe(401);
  });

  it('returns 404 for a missing or unsafe blob key', async () => {
    expect((await h.app.request('/blobs/thumbnails/missing.png')).status).toBe(404);
    expect((await h.app.request('/blobs/..%2Fsecret')).status).toBe(404);
  });
});

describe('lineage', () => {
  it('keeps forkedFrom on a fork and sets versionOf and supersededBy on a version', async () => {
    const project = await createProject(h, staff);
    const source = await submitGarden(h, bob, project.id);

    const forkResponse = await h.call('POST', `/projects/${project.id}/designs`, {
      cookie: molly,
      body: { from: 'fork', sourceDesignId: source.id },
    });
    const fork = designSchema.parse(forkResponse.body);
    expect(fork.lineage).toEqual({ forkedFrom: source.id, versionOf: null, supersededBy: null });

    const versionResponse = await h.call('POST', `/designs/${source.id}/version`, {
      cookie: bob,
    });
    const version = designSchema.parse(versionResponse.body);
    expect(version.lineage.versionOf).toBe(source.id);

    const supersededSource = designSchema.parse(
      (await h.call('GET', `/designs/${source.id}`, { cookie: bob })).body,
    );
    expect(supersededSource.status).toBe('superseded');
    expect(supersededSource.lineage.supersededBy).toBe(version.id);
  });

  it('surfaces the live cap after three submissions', async () => {
    const project = await createProject(h, staff);
    for (let i = 0; i < 3; i += 1) {
      await submitGarden(h, molly, project.id);
    }
    const draft = await createDraft(h, molly, project.id);
    await h.call('PUT', `/designs/${draft.id}`, {
      cookie: molly,
      body: { title: 'Fourth', blurb: 'One more.', document: gardenDoc() },
    });
    const response = await h.call('POST', `/designs/${draft.id}/submit`, { cookie: molly });
    expect(response.status).toBe(422);
    expect(errorKind(response.body)).toBe('liveCapReached');
  });
});

function gardenDoc() {
  return {
    version: 1,
    items: [],
    paths: [],
    areas: [
      {
        id: 'garden-1',
        catalogId: 'community-garden',
        polygon: [
          { x: 10, y: 10 },
          { x: 22, y: 10 },
          { x: 22, y: 26 },
          { x: 10, y: 26 },
        ],
        locked: false,
      },
    ],
    gradeDelta: { cells: [] },
    zones: [],
  };
}
